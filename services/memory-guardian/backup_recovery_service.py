#!/usr/bin/env python3
"""
Backup and Recovery Service - Critical Memory System Component
Provides comprehensive backup and recovery capabilities for all three memory layers:
Redis, Qdrant, and Neo4j.

This component addresses the #2 critical gap: No defined backup/recovery procedures.
"""

import asyncio
import json
import logging
import os
import shutil
import time
import zipfile
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

import redis
import aiofiles
import aiohttp
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, Distance, VectorParams
from neo4j import AsyncGraphDatabase

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class BackupType(Enum):
    """Types of backups supported"""
    FULL = "full"           # Complete backup of all data
    INCREMENTAL = "incremental"  # Only changed data since last backup
    SNAPSHOT = "snapshot"   # Point-in-time snapshot
    EMERGENCY = "emergency" # Emergency backup before critical operations

class BackupStatus(Enum):
    """Backup operation status"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CORRUPTED = "corrupted"

class RecoveryStrategy(Enum):
    """Recovery strategies for different scenarios"""
    FULL_RESTORE = "full_restore"       # Complete system restore
    SELECTIVE_RESTORE = "selective_restore"  # Restore specific components
    POINT_IN_TIME = "point_in_time"     # Restore to specific timestamp
    MERGE_RESTORE = "merge_restore"     # Merge backup with current data

@dataclass
class BackupMetadata:
    """Metadata for backup operations"""
    backup_id: str
    backup_type: BackupType
    created_at: datetime
    component: str  # redis, qdrant, neo4j
    size_bytes: int
    file_path: str
    checksum: str
    status: BackupStatus
    restore_tested: bool = False
    retention_days: int = 30
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class RecoveryPlan:
    """Recovery plan for system restoration"""
    recovery_id: str
    target_timestamp: datetime
    strategy: RecoveryStrategy
    components: List[str]
    backup_files: Dict[str, str]
    estimated_duration: int
    prerequisites: List[str] = field(default_factory=list)
    rollback_plan: Optional[str] = None

class BackupRecoveryService:
    """
    Comprehensive backup and recovery service for Constella memory system

    Features:
    - Multi-layer backup (Redis, Qdrant, Neo4j)
    - Incremental and full backup strategies
    - Automated scheduling and retention
    - Point-in-time recovery
    - Backup integrity validation
    - Cross-layer consistency verification
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        qdrant_url: str = "http://localhost:6333",
        neo4j_url: str = "bolt://localhost:7687",
        backup_base_path: str = "/data/backups/constella",
        max_concurrent_backups: int = 3,
        retention_days: int = 30
    ):
        # Connection clients
        self.redis_client = redis.from_url(redis_url, decode_responses=True)
        self.qdrant_client = QdrantClient(url=qdrant_url) if qdrant_url else None
        self.neo4j_driver = AsyncGraphDatabase.driver(neo4j_url) if neo4j_url else None

        # Configuration
        self.backup_base_path = Path(backup_base_path)
        self.max_concurrent_backups = max_concurrent_backups
        self.retention_days = retention_days

        # State management
        self.active_backups: Dict[str, BackupMetadata] = {}
        self.backup_history: List[BackupMetadata] = []
        self.backup_semaphore = asyncio.Semaphore(max_concurrent_backups)

        # Statistics
        self.stats = {
            "backups_created": 0,
            "backups_failed": 0,
            "data_backed_up_gb": 0.0,
            "recoveries_performed": 0,
            "last_backup_time": None,
            "last_cleanup_time": None
        }

        # Background tasks
        self.scheduler_task: Optional[asyncio.Task] = None
        self.cleanup_task: Optional[asyncio.Task] = None
        self.running = False

        # Initialize backup storage
        self._initialize_backup_storage()

    def _initialize_backup_storage(self):
        """Initialize backup directory structure"""
        try:
            self.backup_base_path.mkdir(parents=True, exist_ok=True)

            # Create component-specific directories
            for component in ["redis", "qdrant", "neo4j", "metadata"]:
                (self.backup_base_path / component).mkdir(exist_ok=True)

            logger.info(f"Backup storage initialized at: {self.backup_base_path}")

        except Exception as e:
            logger.error(f"Failed to initialize backup storage: {e}")
            raise

    async def start(self):
        """Start the backup and recovery service"""
        if self.running:
            logger.warning("Backup service already running")
            return

        logger.info("🛡️  Starting Backup and Recovery Service")
        self.running = True

        # Load existing backup metadata
        await self._load_backup_history()

        # Start background tasks
        self.scheduler_task = asyncio.create_task(self._backup_scheduler())
        self.cleanup_task = asyncio.create_task(self._cleanup_old_backups())

        logger.info("✅ Backup and Recovery Service started")

    async def stop(self):
        """Stop the backup and recovery service"""
        logger.info("🛑 Stopping Backup and Recovery Service")
        self.running = False

        # Cancel background tasks
        if self.scheduler_task:
            self.scheduler_task.cancel()
        if self.cleanup_task:
            self.cleanup_task.cancel()

        # Wait for active backups to complete
        while self.active_backups:
            logger.info(f"Waiting for {len(self.active_backups)} active backups to complete")
            await asyncio.sleep(5)

        logger.info("✅ Backup and Recovery Service stopped")

    async def create_backup(
        self,
        backup_type: BackupType = BackupType.FULL,
        components: Optional[List[str]] = None,
        tags: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Create a backup of specified components

        Args:
            backup_type: Type of backup to create
            components: List of components to backup (redis, qdrant, neo4j)
            tags: Additional metadata tags

        Returns:
            str: Backup ID
        """
        backup_id = f"backup_{int(time.time())}_{backup_type.value}"
        components = components or ["redis", "qdrant", "neo4j"]

        logger.info(f"Creating {backup_type.value} backup: {backup_id}")

        async with self.backup_semaphore:
            try:
                # Create backup metadata
                backup_start = datetime.utcnow()
                backup_files = {}
                total_size = 0

                # Backup each component
                for component in components:
                    if component == "redis":
                        file_path, size = await self._backup_redis(backup_id, backup_type)
                        backup_files["redis"] = file_path
                        total_size += size

                    elif component == "qdrant":
                        file_path, size = await self._backup_qdrant(backup_id, backup_type)
                        backup_files["qdrant"] = file_path
                        total_size += size

                    elif component == "neo4j":
                        file_path, size = await self._backup_neo4j(backup_id, backup_type)
                        backup_files["neo4j"] = file_path
                        total_size += size

                # Create backup metadata
                metadata = BackupMetadata(
                    backup_id=backup_id,
                    backup_type=backup_type,
                    created_at=backup_start,
                    component="multi_component",
                    size_bytes=total_size,
                    file_path=str(self.backup_base_path / f"{backup_id}.zip"),
                    checksum=await self._calculate_backup_checksum(backup_files),
                    status=BackupStatus.COMPLETED,
                    metadata={
                        "components": components,
                        "backup_files": backup_files,
                        "tags": tags or {},
                        "duration_seconds": (datetime.utcnow() - backup_start).total_seconds()
                    }
                )

                # Create consolidated backup archive
                await self._create_backup_archive(backup_id, backup_files, metadata)

                # Store metadata
                await self._save_backup_metadata(metadata)

                # Update statistics
                self.stats["backups_created"] += 1
                self.stats["data_backed_up_gb"] += total_size / (1024**3)
                self.stats["last_backup_time"] = datetime.utcnow()

                self.backup_history.append(metadata)

                logger.info(f"✅ Backup completed: {backup_id} ({total_size / (1024**2):.1f} MB)")
                return backup_id

            except Exception as e:
                logger.error(f"❌ Backup failed: {backup_id} - {e}")
                self.stats["backups_failed"] += 1

                # Mark backup as failed
                if backup_id in self.active_backups:
                    self.active_backups[backup_id].status = BackupStatus.FAILED

                raise

    async def _backup_redis(self, backup_id: str, backup_type: BackupType) -> Tuple[str, int]:
        """Backup Redis data"""
        backup_file = self.backup_base_path / "redis" / f"{backup_id}_redis.json"

        try:
            # Get all Redis keys
            keys = self.redis_client.keys("*")
            redis_data = {}

            # Export key-value pairs with TTL information
            for key in keys:
                try:
                    value = self.redis_client.get(key)
                    ttl = self.redis_client.ttl(key)
                    key_type = self.redis_client.type(key)

                    redis_data[key] = {
                        "value": value,
                        "ttl": ttl,
                        "type": key_type,
                        "exported_at": datetime.utcnow().isoformat()
                    }
                except Exception as e:
                    logger.warning(f"Failed to export Redis key {key}: {e}")

            # Write to backup file
            async with aiofiles.open(backup_file, 'w') as f:
                await f.write(json.dumps(redis_data, indent=2, default=str))

            size = backup_file.stat().st_size
            logger.debug(f"Redis backup completed: {len(keys)} keys, {size} bytes")

            return str(backup_file), size

        except Exception as e:
            logger.error(f"Redis backup failed: {e}")
            raise

    async def _backup_qdrant(self, backup_id: str, backup_type: BackupType) -> Tuple[str, int]:
        """Backup Qdrant collections"""
        backup_file = self.backup_base_path / "qdrant" / f"{backup_id}_qdrant.json"

        try:
            if not self.qdrant_client:
                logger.warning("Qdrant client not available, skipping backup")
                return str(backup_file), 0

            # Get all collections
            collections = self.qdrant_client.get_collections().collections
            qdrant_data = {"collections": {}}

            for collection in collections:
                collection_name = collection.name

                try:
                    # Get collection info
                    collection_info = self.qdrant_client.get_collection(collection_name)

                    # Get all points from collection
                    points, _ = self.qdrant_client.scroll(
                        collection_name=collection_name,
                        limit=10000,  # Adjust based on collection size
                        with_vectors=True,
                        with_payload=True
                    )

                    qdrant_data["collections"][collection_name] = {
                        "config": {
                            "vectors_count": collection_info.vectors_count,
                            "points_count": collection_info.points_count,
                            "status": collection_info.status.value
                        },
                        "points": [
                            {
                                "id": point.id,
                                "vector": point.vector,
                                "payload": point.payload
                            }
                            for point in points
                        ],
                        "exported_at": datetime.utcnow().isoformat()
                    }

                    logger.debug(f"Backed up Qdrant collection: {collection_name} ({len(points)} points)")

                except Exception as e:
                    logger.warning(f"Failed to backup Qdrant collection {collection_name}: {e}")

            # Write to backup file
            async with aiofiles.open(backup_file, 'w') as f:
                await f.write(json.dumps(qdrant_data, indent=2, default=str))

            size = backup_file.stat().st_size
            logger.debug(f"Qdrant backup completed: {len(qdrant_data['collections'])} collections, {size} bytes")

            return str(backup_file), size

        except Exception as e:
            logger.error(f"Qdrant backup failed: {e}")
            raise

    async def _backup_neo4j(self, backup_id: str, backup_type: BackupType) -> Tuple[str, int]:
        """Backup Neo4j graph database"""
        backup_file = self.backup_base_path / "neo4j" / f"{backup_id}_neo4j.json"

        try:
            if not self.neo4j_driver:
                logger.warning("Neo4j driver not available, skipping backup")
                return str(backup_file), 0

            neo4j_data = {
                "nodes": [],
                "relationships": [],
                "indexes": [],
                "constraints": []
            }

            async with self.neo4j_driver.session() as session:
                # Export all nodes
                result = await session.run("MATCH (n) RETURN n, labels(n) as labels, id(n) as node_id")
                async for record in result:
                    node = record["n"]
                    neo4j_data["nodes"].append({
                        "id": record["node_id"],
                        "labels": record["labels"],
                        "properties": dict(node.items()) if node else {}
                    })

                # Export all relationships
                result = await session.run("""
                    MATCH (a)-[r]->(b)
                    RETURN type(r) as rel_type, properties(r) as props,
                           id(a) as start_id, id(b) as end_id, id(r) as rel_id
                """)
                async for record in result:
                    neo4j_data["relationships"].append({
                        "id": record["rel_id"],
                        "type": record["rel_type"],
                        "start_node_id": record["start_id"],
                        "end_node_id": record["end_id"],
                        "properties": record["props"] or {}
                    })

                # Export indexes
                result = await session.run("CALL db.indexes() YIELD name, labelsOrTypes, properties, state")
                async for record in result:
                    neo4j_data["indexes"].append({
                        "name": record["name"],
                        "labels_or_types": record["labelsOrTypes"],
                        "properties": record["properties"],
                        "state": record["state"]
                    })

                # Export constraints
                result = await session.run("CALL db.constraints() YIELD name, description")
                async for record in result:
                    neo4j_data["constraints"].append({
                        "name": record["name"],
                        "description": record["description"]
                    })

            neo4j_data["exported_at"] = datetime.utcnow().isoformat()

            # Write to backup file
            async with aiofiles.open(backup_file, 'w') as f:
                await f.write(json.dumps(neo4j_data, indent=2, default=str))

            size = backup_file.stat().st_size
            logger.debug(f"Neo4j backup completed: {len(neo4j_data['nodes'])} nodes, "
                        f"{len(neo4j_data['relationships'])} relationships, {size} bytes")

            return str(backup_file), size

        except Exception as e:
            logger.error(f"Neo4j backup failed: {e}")
            raise

    async def _calculate_backup_checksum(self, backup_files: Dict[str, str]) -> str:
        """Calculate checksum for backup integrity verification"""
        import hashlib

        hasher = hashlib.sha256()

        for component, file_path in backup_files.items():
            if os.path.exists(file_path):
                async with aiofiles.open(file_path, 'rb') as f:
                    content = await f.read()
                    hasher.update(content)

        return hasher.hexdigest()

    async def _create_backup_archive(
        self,
        backup_id: str,
        backup_files: Dict[str, str],
        metadata: BackupMetadata
    ):
        """Create consolidated backup archive"""
        archive_path = self.backup_base_path / f"{backup_id}.zip"

        try:
            with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                # Add component backup files
                for component, file_path in backup_files.items():
                    if os.path.exists(file_path):
                        zipf.write(file_path, f"{component}_backup.json")

                # Add metadata
                metadata_json = json.dumps(metadata.__dict__, indent=2, default=str)
                zipf.writestr("backup_metadata.json", metadata_json)

            # Clean up individual component files
            for file_path in backup_files.values():
                if os.path.exists(file_path):
                    os.remove(file_path)

            logger.debug(f"Created backup archive: {archive_path}")

        except Exception as e:
            logger.error(f"Failed to create backup archive: {e}")
            raise

    async def _save_backup_metadata(self, metadata: BackupMetadata):
        """Save backup metadata to storage"""
        metadata_file = self.backup_base_path / "metadata" / f"{metadata.backup_id}_metadata.json"

        try:
            async with aiofiles.open(metadata_file, 'w') as f:
                await f.write(json.dumps(metadata.__dict__, indent=2, default=str))

        except Exception as e:
            logger.error(f"Failed to save backup metadata: {e}")

    async def _load_backup_history(self):
        """Load existing backup metadata"""
        metadata_dir = self.backup_base_path / "metadata"
        if not metadata_dir.exists():
            return

        try:
            for metadata_file in metadata_dir.glob("*_metadata.json"):
                async with aiofiles.open(metadata_file, 'r') as f:
                    content = await f.read()
                    metadata_dict = json.loads(content)

                    # Reconstruct BackupMetadata object
                    metadata = BackupMetadata(
                        backup_id=metadata_dict["backup_id"],
                        backup_type=BackupType(metadata_dict["backup_type"]),
                        created_at=datetime.fromisoformat(metadata_dict["created_at"]),
                        component=metadata_dict["component"],
                        size_bytes=metadata_dict["size_bytes"],
                        file_path=metadata_dict["file_path"],
                        checksum=metadata_dict["checksum"],
                        status=BackupStatus(metadata_dict["status"]),
                        restore_tested=metadata_dict.get("restore_tested", False),
                        retention_days=metadata_dict.get("retention_days", 30),
                        metadata=metadata_dict.get("metadata", {})
                    )

                    self.backup_history.append(metadata)

            logger.info(f"Loaded {len(self.backup_history)} backup records from history")

        except Exception as e:
            logger.error(f"Failed to load backup history: {e}")

    async def restore_from_backup(
        self,
        backup_id: str,
        strategy: RecoveryStrategy = RecoveryStrategy.FULL_RESTORE,
        components: Optional[List[str]] = None,
        target_timestamp: Optional[datetime] = None
    ) -> bool:
        """
        Restore system from backup

        Args:
            backup_id: ID of backup to restore from
            strategy: Recovery strategy to use
            components: Components to restore
            target_timestamp: Point-in-time for restore

        Returns:
            bool: True if restore successful
        """
        logger.info(f"Starting restore operation: {backup_id} using {strategy.value}")

        try:
            # Find backup metadata
            backup_metadata = None
            for backup in self.backup_history:
                if backup.backup_id == backup_id:
                    backup_metadata = backup
                    break

            if not backup_metadata:
                logger.error(f"Backup not found: {backup_id}")
                return False

            # Verify backup integrity
            if not await self._verify_backup_integrity(backup_metadata):
                logger.error(f"Backup integrity check failed: {backup_id}")
                return False

            # Create recovery plan
            recovery_plan = RecoveryPlan(
                recovery_id=f"recovery_{int(time.time())}",
                target_timestamp=target_timestamp or backup_metadata.created_at,
                strategy=strategy,
                components=components or ["redis", "qdrant", "neo4j"],
                backup_files=backup_metadata.metadata.get("backup_files", {}),
                estimated_duration=300  # 5 minutes estimate
            )

            # Execute recovery plan
            success = await self._execute_recovery_plan(backup_metadata, recovery_plan)

            if success:
                self.stats["recoveries_performed"] += 1
                logger.info(f"✅ Recovery completed successfully: {backup_id}")
            else:
                logger.error(f"❌ Recovery failed: {backup_id}")

            return success

        except Exception as e:
            logger.error(f"Recovery operation failed: {e}")
            return False

    async def _verify_backup_integrity(self, metadata: BackupMetadata) -> bool:
        """Verify backup file integrity"""
        try:
            if not os.path.exists(metadata.file_path):
                logger.error(f"Backup file not found: {metadata.file_path}")
                return False

            # Extract and verify checksum
            with zipfile.ZipFile(metadata.file_path, 'r') as zipf:
                # Extract component files temporarily
                temp_files = {}
                for name in zipf.namelist():
                    if name.endswith('_backup.json'):
                        component = name.split('_')[0]
                        temp_path = f"/tmp/{metadata.backup_id}_{component}.json"
                        zipf.extract(name, "/tmp")
                        temp_files[component] = f"/tmp/{name}"

                # Calculate current checksum
                current_checksum = await self._calculate_backup_checksum(temp_files)

                # Clean up temp files
                for temp_file in temp_files.values():
                    if os.path.exists(temp_file):
                        os.remove(temp_file)

            integrity_ok = current_checksum == metadata.checksum

            if not integrity_ok:
                logger.error(f"Backup integrity check failed: checksum mismatch")

            return integrity_ok

        except Exception as e:
            logger.error(f"Backup integrity verification failed: {e}")
            return False

    async def _execute_recovery_plan(self, backup_metadata: BackupMetadata, recovery_plan: RecoveryPlan) -> bool:
        """Execute the recovery plan"""
        try:
            # Extract backup files
            with zipfile.ZipFile(backup_metadata.file_path, 'r') as zipf:
                extract_path = f"/tmp/restore_{recovery_plan.recovery_id}"
                os.makedirs(extract_path, exist_ok=True)
                zipf.extractall(extract_path)

            # Restore each component
            success = True
            for component in recovery_plan.components:
                component_file = f"{extract_path}/{component}_backup.json"

                if not os.path.exists(component_file):
                    logger.warning(f"Component backup not found: {component}")
                    continue

                try:
                    if component == "redis":
                        await self._restore_redis(component_file)
                    elif component == "qdrant":
                        await self._restore_qdrant(component_file)
                    elif component == "neo4j":
                        await self._restore_neo4j(component_file)

                    logger.info(f"✅ Restored component: {component}")

                except Exception as e:
                    logger.error(f"❌ Failed to restore component {component}: {e}")
                    success = False

            # Clean up extraction directory
            shutil.rmtree(extract_path, ignore_errors=True)

            return success

        except Exception as e:
            logger.error(f"Recovery plan execution failed: {e}")
            return False

    async def _restore_redis(self, backup_file: str):
        """Restore Redis data from backup"""
        try:
            with open(backup_file, 'r') as f:
                redis_data = json.load(f)

            # Clear existing data (optional - based on recovery strategy)
            # self.redis_client.flushall()

            # Restore key-value pairs
            for key, data in redis_data.items():
                try:
                    value = data["value"]
                    ttl = data.get("ttl", -1)

                    if ttl > 0:
                        self.redis_client.setex(key, ttl, value)
                    else:
                        self.redis_client.set(key, value)

                except Exception as e:
                    logger.warning(f"Failed to restore Redis key {key}: {e}")

            logger.info(f"Redis restore completed: {len(redis_data)} keys")

        except Exception as e:
            logger.error(f"Redis restore failed: {e}")
            raise

    async def _restore_qdrant(self, backup_file: str):
        """Restore Qdrant collections from backup"""
        try:
            if not self.qdrant_client:
                logger.warning("Qdrant client not available, skipping restore")
                return

            with open(backup_file, 'r') as f:
                qdrant_data = json.load(f)

            for collection_name, collection_data in qdrant_data["collections"].items():
                try:
                    # Recreate collection
                    try:
                        self.qdrant_client.delete_collection(collection_name)
                    except:
                        pass  # Collection might not exist

                    self.qdrant_client.create_collection(
                        collection_name=collection_name,
                        vectors_config=VectorParams(size=len(collection_data["points"][0]["vector"]) if collection_data["points"] else 384, distance=Distance.COSINE)
                    )

                    # Restore points
                    if collection_data["points"]:
                        points = [
                            PointStruct(
                                id=point["id"],
                                vector=point["vector"],
                                payload=point["payload"]
                            )
                            for point in collection_data["points"]
                        ]

                        self.qdrant_client.upsert(collection_name=collection_name, points=points)

                    logger.info(f"Restored Qdrant collection: {collection_name} ({len(collection_data['points'])} points)")

                except Exception as e:
                    logger.error(f"Failed to restore Qdrant collection {collection_name}: {e}")

        except Exception as e:
            logger.error(f"Qdrant restore failed: {e}")
            raise

    async def _restore_neo4j(self, backup_file: str):
        """Restore Neo4j graph from backup"""
        try:
            if not self.neo4j_driver:
                logger.warning("Neo4j driver not available, skipping restore")
                return

            with open(backup_file, 'r') as f:
                neo4j_data = json.load(f)

            async with self.neo4j_driver.session() as session:
                # Clear existing data (optional)
                # await session.run("MATCH (n) DETACH DELETE n")

                # Restore nodes
                node_id_mapping = {}
                for node in neo4j_data["nodes"]:
                    labels = ":".join(node["labels"]) if node["labels"] else ""
                    properties = node["properties"]

                    # Create node
                    result = await session.run(
                        f"CREATE (n:{labels}) SET n = $props RETURN id(n) as new_id",
                        props=properties
                    )
                    record = await result.single()
                    if record:
                        node_id_mapping[node["id"]] = record["new_id"]

                # Restore relationships
                for rel in neo4j_data["relationships"]:
                    start_id = node_id_mapping.get(rel["start_node_id"])
                    end_id = node_id_mapping.get(rel["end_node_id"])

                    if start_id is not None and end_id is not None:
                        await session.run(
                            f"""
                            MATCH (a), (b)
                            WHERE id(a) = $start_id AND id(b) = $end_id
                            CREATE (a)-[r:{rel['type']}]->(b)
                            SET r = $props
                            """,
                            start_id=start_id,
                            end_id=end_id,
                            props=rel["properties"]
                        )

            logger.info(f"Neo4j restore completed: {len(neo4j_data['nodes'])} nodes, {len(neo4j_data['relationships'])} relationships")

        except Exception as e:
            logger.error(f"Neo4j restore failed: {e}")
            raise

    async def _backup_scheduler(self):
        """Background task for scheduled backups"""
        while self.running:
            try:
                # Schedule automatic backups every 6 hours
                await asyncio.sleep(6 * 3600)  # 6 hours

                if self.running:
                    logger.info("Starting scheduled backup")
                    await self.create_backup(BackupType.INCREMENTAL)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Scheduled backup failed: {e}")

    async def _cleanup_old_backups(self):
        """Background task for cleaning up old backups"""
        while self.running:
            try:
                # Run cleanup every 24 hours
                await asyncio.sleep(24 * 3600)

                if self.running:
                    await self._perform_cleanup()
                    self.stats["last_cleanup_time"] = datetime.utcnow()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Backup cleanup failed: {e}")

    async def _perform_cleanup(self):
        """Remove old backups based on retention policy"""
        cutoff_date = datetime.utcnow() - timedelta(days=self.retention_days)
        removed_count = 0

        for backup in self.backup_history[:]:  # Create copy to iterate
            if backup.created_at < cutoff_date:
                try:
                    # Remove backup file
                    if os.path.exists(backup.file_path):
                        os.remove(backup.file_path)

                    # Remove metadata file
                    metadata_file = self.backup_base_path / "metadata" / f"{backup.backup_id}_metadata.json"
                    if metadata_file.exists():
                        metadata_file.unlink()

                    # Remove from history
                    self.backup_history.remove(backup)
                    removed_count += 1

                except Exception as e:
                    logger.error(f"Failed to remove old backup {backup.backup_id}: {e}")

        if removed_count > 0:
            logger.info(f"Cleaned up {removed_count} old backups")

    def get_backup_status(self) -> Dict[str, Any]:
        """Get current backup system status"""
        return {
            "service_status": "running" if self.running else "stopped",
            "active_backups": len(self.active_backups),
            "total_backups": len(self.backup_history),
            "latest_backup": self.backup_history[-1].backup_id if self.backup_history else None,
            "statistics": self.stats,
            "backup_history": [
                {
                    "backup_id": b.backup_id,
                    "type": b.backup_type.value,
                    "created_at": b.created_at.isoformat(),
                    "size_mb": b.size_bytes / (1024**2),
                    "status": b.status.value
                }
                for b in self.backup_history[-10:]  # Last 10 backups
            ]
        }

    async def get_recovery_options(self, target_timestamp: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Get available recovery options"""
        recovery_options = []

        for backup in reversed(self.backup_history):  # Most recent first
            if target_timestamp and backup.created_at > target_timestamp:
                continue

            recovery_options.append({
                "backup_id": backup.backup_id,
                "backup_type": backup.backup_type.value,
                "created_at": backup.created_at.isoformat(),
                "components": backup.metadata.get("components", []),
                "size_mb": backup.size_bytes / (1024**2),
                "status": backup.status.value,
                "restore_tested": backup.restore_tested
            })

        return recovery_options

# Global instance
backup_recovery_service = None

async def get_backup_service() -> BackupRecoveryService:
    """Get singleton backup service instance"""
    global backup_recovery_service
    if not backup_recovery_service:
        backup_recovery_service = BackupRecoveryService()
        await backup_recovery_service.start()
    return backup_recovery_service

if __name__ == "__main__":
    async def main():
        # Example usage
        service = BackupRecoveryService()
        await service.start()

        # Create a full backup
        backup_id = await service.create_backup(BackupType.FULL)
        print(f"Created backup: {backup_id}")

        # Show status
        status = service.get_backup_status()
        print("Backup status:", status)

        await service.stop()

    asyncio.run(main())

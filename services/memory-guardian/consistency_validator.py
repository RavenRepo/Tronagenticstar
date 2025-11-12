#!/usr/bin/env python3
"""
Consistency Validation System - Critical Memory System Component
Validates data consistency across Redis, Qdrant, and Neo4j memory layers
and detects/corrects inconsistencies to maintain data integrity.

This component addresses the #4 critical gap: No cross-layer data consistency validation.
"""

import asyncio
import json
import logging
import hashlib
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple, Set
from dataclasses import dataclass, field
from enum import Enum

import redis
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, Distance, VectorParams
from neo4j import AsyncGraphDatabase

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class InconsistencyType(Enum):
    """Types of data inconsistencies"""
    MISSING_DATA = "missing_data"           # Data exists in one layer but not others
    STALE_DATA = "stale_data"              # Data timestamp mismatch between layers
    CORRUPTED_DATA = "corrupted_data"       # Data integrity failure (checksum mismatch)
    ORPHANED_DATA = "orphaned_data"         # Data without proper relationships
    DUPLICATE_DATA = "duplicate_data"       # Duplicate entries across layers
    SCHEMA_MISMATCH = "schema_mismatch"     # Data structure inconsistencies

class InconsistencySeverity(Enum):
    """Severity levels for inconsistencies"""
    LOW = "low"                # Minor inconsistencies, system can operate
    MEDIUM = "medium"          # Moderate impact on functionality
    HIGH = "high"              # Significant impact, needs attention
    CRITICAL = "critical"      # System integrity at risk

class ValidationStatus(Enum):
    """Status of validation operations"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIALLY_COMPLETED = "partially_completed"

@dataclass
class InconsistencyReport:
    """Report of detected inconsistencies"""
    inconsistency_id: str
    type: InconsistencyType
    severity: InconsistencySeverity
    affected_layers: List[str]
    description: str
    affected_keys: List[str]
    expected_value: Any
    actual_values: Dict[str, Any]
    discovered_at: datetime
    resolved: bool = False
    resolution_notes: Optional[str] = None
    resolved_at: Optional[datetime] = None

@dataclass
class ValidationTask:
    """Consistency validation task"""
    task_id: str
    validation_type: str
    scope: List[str]  # Components to validate
    target_keys: Optional[List[str]] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    status: ValidationStatus = ValidationStatus.PENDING
    progress_percentage: float = 0.0
    results: Dict[str, Any] = field(default_factory=dict)
    inconsistencies_found: List[str] = field(default_factory=list)

@dataclass
class ConsistencyMetrics:
    """Metrics about system consistency"""
    total_validated_items: int
    consistent_items: int
    inconsistent_items: int
    consistency_percentage: float
    last_validation: datetime
    validation_duration_ms: float
    inconsistencies_by_type: Dict[str, int]
    inconsistencies_by_severity: Dict[str, int]

class ConsistencyValidationSystem:
    """
    Comprehensive consistency validation system for Constella memory layers

    Features:
    - Cross-layer data consistency validation
    - Real-time inconsistency detection
    - Automated repair mechanisms
    - Consistency metrics and reporting
    - Scheduled validation tasks
    - Conflict resolution strategies
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        qdrant_url: str = "http://localhost:6333",
        neo4j_url: str = "bolt://localhost:7687",
        validation_interval: int = 3600,  # 1 hour
        repair_mode: bool = True,
        max_concurrent_validations: int = 5
    ):
        # Connection clients
        self.redis_client = redis.from_url(redis_url, decode_responses=True)
        self.qdrant_client = QdrantClient(url=qdrant_url) if qdrant_url else None
        self.neo4j_driver = AsyncGraphDatabase.driver(neo4j_url) if neo4j_url else None

        # Configuration
        self.validation_interval = validation_interval
        self.repair_mode = repair_mode
        self.max_concurrent_validations = max_concurrent_validations

        # State management
        self.active_tasks: Dict[str, ValidationTask] = {}
        self.inconsistency_reports: Dict[str, InconsistencyReport] = {}
        self.consistency_history: List[ConsistencyMetrics] = []
        self.validation_semaphore = asyncio.Semaphore(max_concurrent_validations)

        # Statistics
        self.stats = {
            "validations_performed": 0,
            "inconsistencies_detected": 0,
            "inconsistencies_repaired": 0,
            "total_items_validated": 0,
            "last_full_validation": None,
            "system_consistency_score": 100.0
        }

        # Background tasks
        self.scheduler_task: Optional[asyncio.Task] = None
        self.monitor_task: Optional[asyncio.Task] = None
        self.running = False

        # Validation rules configuration
        self._initialize_validation_rules()

    def _initialize_validation_rules(self):
        """Initialize validation rules for different data types"""
        self.validation_rules = {
            "workflow_context": {
                "redis_key_pattern": "workflow:*",
                "qdrant_collection": "workflow_memory",
                "neo4j_label": "Workflow",
                "required_fields": ["workflow_id", "status", "created_at"],
                "consistency_checks": ["timestamp_match", "status_sync", "relationship_integrity"]
            },
            "project_context": {
                "redis_key_pattern": "project_context:*",
                "qdrant_collection": "project_knowledge",
                "neo4j_label": "Project",
                "required_fields": ["project_id", "name", "last_updated"],
                "consistency_checks": ["data_integrity", "timestamp_match", "reference_validity"]
            },
            "agent_memory": {
                "redis_key_pattern": "agent_memory:*",
                "qdrant_collection": "agent_memories",
                "neo4j_label": "AgentMemory",
                "required_fields": ["agent_id", "memory_type", "created_at"],
                "consistency_checks": ["memory_sync", "embedding_consistency", "graph_relationships"]
            }
        }

    async def start(self):
        """Start the consistency validation system"""
        if self.running:
            logger.warning("Consistency validation system already running")
            return

        logger.info("🔍 Starting Consistency Validation System")
        self.running = True

        # Start background tasks
        self.scheduler_task = asyncio.create_task(self._validation_scheduler())
        self.monitor_task = asyncio.create_task(self._monitoring_loop())

        logger.info("✅ Consistency Validation System started successfully")

    async def stop(self):
        """Stop the consistency validation system"""
        logger.info("🛑 Stopping Consistency Validation System")
        self.running = False

        # Cancel background tasks
        if self.scheduler_task:
            self.scheduler_task.cancel()
        if self.monitor_task:
            self.monitor_task.cancel()

        # Wait for active validations to complete
        while self.active_tasks:
            logger.info(f"Waiting for {len(self.active_tasks)} active validation tasks")
            await asyncio.sleep(2)

        logger.info("✅ Consistency Validation System stopped")

    async def validate_system_consistency(
        self,
        scope: Optional[List[str]] = None,
        repair_inconsistencies: bool = None
    ) -> str:
        """
        Perform comprehensive system consistency validation

        Args:
            scope: List of components to validate (redis, qdrant, neo4j)
            repair_inconsistencies: Whether to automatically repair found issues

        Returns:
            str: Task ID for tracking validation progress
        """
        task_id = f"validation_{int(time.time())}"
        scope = scope or ["redis", "qdrant", "neo4j"]
        repair_mode = repair_inconsistencies if repair_inconsistencies is not None else self.repair_mode

        logger.info(f"Starting system consistency validation: {task_id}")

        # Create validation task
        task = ValidationTask(
            task_id=task_id,
            validation_type="full_system",
            scope=scope
        )

        self.active_tasks[task_id] = task

        # Execute validation asynchronously
        asyncio.create_task(self._execute_validation_task(task, repair_mode))

        return task_id

    async def validate_specific_keys(
        self,
        keys: List[str],
        validation_type: str = "targeted",
        repair_inconsistencies: bool = None
    ) -> str:
        """Validate consistency for specific keys"""
        task_id = f"validation_{validation_type}_{int(time.time())}"
        repair_mode = repair_inconsistencies if repair_inconsistencies is not None else self.repair_mode

        task = ValidationTask(
            task_id=task_id,
            validation_type=validation_type,
            scope=["redis", "qdrant", "neo4j"],
            target_keys=keys
        )

        self.active_tasks[task_id] = task
        asyncio.create_task(self._execute_validation_task(task, repair_mode))

        return task_id

    async def _execute_validation_task(self, task: ValidationTask, repair_mode: bool):
        """Execute a validation task"""
        async with self.validation_semaphore:
            try:
                task.status = ValidationStatus.IN_PROGRESS
                start_time = time.time()

                inconsistencies_found = []
                total_items = 0
                consistent_items = 0

                # Validate each data type
                for data_type, rules in self.validation_rules.items():
                    try:
                        # Get data from each layer
                        redis_data = await self._get_redis_data(rules["redis_key_pattern"], task.target_keys)
                        qdrant_data = await self._get_qdrant_data(rules["qdrant_collection"], task.target_keys)
                        neo4j_data = await self._get_neo4j_data(rules["neo4j_label"], task.target_keys)

                        # Perform consistency checks
                        data_inconsistencies = await self._check_data_consistency(
                            data_type, rules, redis_data, qdrant_data, neo4j_data
                        )

                        inconsistencies_found.extend(data_inconsistencies)
                        total_items += len(redis_data) + len(qdrant_data) + len(neo4j_data)

                        # Update progress
                        task.progress_percentage = (len(task.results) + 1) / len(self.validation_rules) * 100

                    except Exception as e:
                        logger.error(f"Validation failed for {data_type}: {e}")
                        task.results[data_type] = {"error": str(e)}

                # Calculate consistency metrics
                consistent_items = total_items - len(inconsistencies_found)
                consistency_percentage = (consistent_items / total_items * 100) if total_items > 0 else 100

                # Repair inconsistencies if requested
                if repair_mode and inconsistencies_found:
                    repair_results = await self._repair_inconsistencies(inconsistencies_found)
                    task.results["repairs_attempted"] = len(repair_results)
                    task.results["repairs_successful"] = sum(1 for r in repair_results if r["success"])

                # Finalize task
                execution_time = (time.time() - start_time) * 1000
                task.status = ValidationStatus.COMPLETED
                task.progress_percentage = 100.0
                task.inconsistencies_found = [inc.inconsistency_id for inc in inconsistencies_found]

                # Create consistency metrics
                metrics = ConsistencyMetrics(
                    total_validated_items=total_items,
                    consistent_items=consistent_items,
                    inconsistent_items=len(inconsistencies_found),
                    consistency_percentage=consistency_percentage,
                    last_validation=datetime.utcnow(),
                    validation_duration_ms=execution_time,
                    inconsistencies_by_type={t.value: 0 for t in InconsistencyType},
                    inconsistencies_by_severity={s.value: 0 for s in InconsistencySeverity}
                )

                # Update statistics
                for inc in inconsistencies_found:
                    metrics.inconsistencies_by_type[inc.type.value] += 1
                    metrics.inconsistencies_by_severity[inc.severity.value] += 1

                self.consistency_history.append(metrics)
                self.stats["validations_performed"] += 1
                self.stats["inconsistencies_detected"] += len(inconsistencies_found)
                self.stats["total_items_validated"] += total_items
                self.stats["last_full_validation"] = datetime.utcnow()
                self.stats["system_consistency_score"] = consistency_percentage

                logger.info(f"✅ Validation completed: {task.task_id} "
                           f"({consistency_percentage:.1f}% consistent, {len(inconsistencies_found)} issues)")

            except Exception as e:
                logger.error(f"Validation task failed: {task.task_id} - {e}")
                task.status = ValidationStatus.FAILED
                task.results["error"] = str(e)

            finally:
                # Remove from active tasks after delay (for status checking)
                await asyncio.sleep(300)  # Keep for 5 minutes
                if task.task_id in self.active_tasks:
                    del self.active_tasks[task.task_id]

    async def _get_redis_data(self, pattern: str, specific_keys: Optional[List[str]] = None) -> Dict[str, Any]:
        """Get data from Redis based on pattern or specific keys"""
        try:
            if specific_keys:
                # Filter specific keys by pattern
                keys = [k for k in specific_keys if self._matches_pattern(k, pattern)]
            else:
                keys = self.redis_client.keys(pattern)

            redis_data = {}
            for key in keys:
                try:
                    value = self.redis_client.get(key)
                    ttl = self.redis_client.ttl(key)
                    redis_data[key] = {
                        "value": value,
                        "ttl": ttl,
                        "retrieved_at": datetime.utcnow().isoformat(),
                        "checksum": hashlib.md5(str(value).encode()).hexdigest() if value else None
                    }
                except Exception as e:
                    logger.debug(f"Failed to retrieve Redis key {key}: {e}")

            return redis_data

        except Exception as e:
            logger.error(f"Failed to get Redis data: {e}")
            return {}

    async def _get_qdrant_data(self, collection_name: str, specific_keys: Optional[List[str]] = None) -> Dict[str, Any]:
        """Get data from Qdrant collection"""
        try:
            if not self.qdrant_client:
                return {}

            qdrant_data = {}

            # Check if collection exists
            collections = self.qdrant_client.get_collections().collections
            if not any(c.name == collection_name for c in collections):
                return qdrant_data

            if specific_keys:
                # Retrieve specific points by ID
                try:
                    points = self.qdrant_client.retrieve(
                        collection_name=collection_name,
                        ids=specific_keys,
                        with_payload=True,
                        with_vectors=False
                    )
                    for point in points:
                        qdrant_data[str(point.id)] = {
                            "payload": point.payload,
                            "retrieved_at": datetime.utcnow().isoformat(),
                            "checksum": hashlib.md5(json.dumps(point.payload, sort_keys=True).encode()).hexdigest()
                        }
                except Exception as e:
                    logger.debug(f"Failed to retrieve specific Qdrant points: {e}")
            else:
                # Get all points from collection
                try:
                    points, _ = self.qdrant_client.scroll(
                        collection_name=collection_name,
                        limit=1000,  # Adjust based on collection size
                        with_payload=True,
                        with_vectors=False
                    )
                    for point in points:
                        qdrant_data[str(point.id)] = {
                            "payload": point.payload,
                            "retrieved_at": datetime.utcnow().isoformat(),
                            "checksum": hashlib.md5(json.dumps(point.payload, sort_keys=True).encode()).hexdigest()
                        }
                except Exception as e:
                    logger.debug(f"Failed to scroll Qdrant collection: {e}")

            return qdrant_data

        except Exception as e:
            logger.error(f"Failed to get Qdrant data: {e}")
            return {}

    async def _get_neo4j_data(self, label: str, specific_keys: Optional[List[str]] = None) -> Dict[str, Any]:
        """Get data from Neo4j based on label"""
        try:
            if not self.neo4j_driver:
                return {}

            neo4j_data = {}

            async with self.neo4j_driver.session() as session:
                if specific_keys:
                    # Get specific nodes by ID or property
                    for key in specific_keys:
                        try:
                            result = await session.run(
                                f"MATCH (n:{label}) WHERE n.id = $key OR toString(id(n)) = $key "
                                "RETURN n, id(n) as node_id",
                                key=key
                            )
                            async for record in result:
                                node = record["n"]
                                node_id = str(record["node_id"])
                                node_props = dict(node.items()) if node else {}
                                neo4j_data[node_id] = {
                                    "properties": node_props,
                                    "labels": list(node.labels) if node else [],
                                    "retrieved_at": datetime.utcnow().isoformat(),
                                    "checksum": hashlib.md5(json.dumps(node_props, sort_keys=True).encode()).hexdigest()
                                }
                        except Exception as e:
                            logger.debug(f"Failed to retrieve Neo4j node {key}: {e}")
                else:
                    # Get all nodes with specified label
                    try:
                        result = await session.run(
                            f"MATCH (n:{label}) RETURN n, id(n) as node_id LIMIT 1000"
                        )
                        async for record in result:
                            node = record["n"]
                            node_id = str(record["node_id"])
                            node_props = dict(node.items()) if node else {}
                            neo4j_data[node_id] = {
                                "properties": node_props,
                                "labels": list(node.labels) if node else [],
                                "retrieved_at": datetime.utcnow().isoformat(),
                                "checksum": hashlib.md5(json.dumps(node_props, sort_keys=True).encode()).hexdigest()
                            }
                    except Exception as e:
                        logger.debug(f"Failed to query Neo4j nodes: {e}")

            return neo4j_data

        except Exception as e:
            logger.error(f"Failed to get Neo4j data: {e}")
            return {}

    async def _check_data_consistency(
        self,
        data_type: str,
        rules: Dict[str, Any],
        redis_data: Dict[str, Any],
        qdrant_data: Dict[str, Any],
        neo4j_data: Dict[str, Any]
    ) -> List[InconsistencyReport]:
        """Check consistency between data layers"""
        inconsistencies = []

        # Get all unique keys across layers
        all_keys = set(redis_data.keys()) | set(qdrant_data.keys()) | set(neo4j_data.keys())

        for key in all_keys:
            redis_entry = redis_data.get(key)
            qdrant_entry = qdrant_data.get(key)
            neo4j_entry = neo4j_data.get(key)

            # Check for missing data across layers
            layers_with_data = []
            if redis_entry:
                layers_with_data.append("redis")
            if qdrant_entry:
                layers_with_data.append("qdrant")
            if neo4j_entry:
                layers_with_data.append("neo4j")

            # Missing data inconsistency
            if len(layers_with_data) < len(rules.get("consistency_checks", [])):
                inconsistency_id = f"{data_type}_{key}_missing_{int(time.time())}"
                inconsistencies.append(InconsistencyReport(
                    inconsistency_id=inconsistency_id,
                    type=InconsistencyType.MISSING_DATA,
                    severity=InconsistencySeverity.MEDIUM,
                    affected_layers=[layer for layer in ["redis", "qdrant", "neo4j"] if layer not in layers_with_data],
                    description=f"Data missing in some layers for key: {key}",
                    affected_keys=[key],
                    expected_value=f"Data present in all layers",
                    actual_values={
                        "redis": "present" if redis_entry else "missing",
                        "qdrant": "present" if qdrant_entry else "missing",
                        "neo4j": "present" if neo4j_entry else "missing"
                    },
                    discovered_at=datetime.utcnow()
                ))

            # Data integrity checks (checksum comparison)
            if len(layers_with_data) >= 2:
                checksums = {}
                if redis_entry and redis_entry.get("checksum"):
                    checksums["redis"] = redis_entry["checksum"]
                if qdrant_entry and qdrant_entry.get("checksum"):
                    checksums["qdrant"] = qdrant_entry["checksum"]
                if neo4j_entry and neo4j_entry.get("checksum"):
                    checksums["neo4j"] = neo4j_entry["checksum"]

                if len(set(checksums.values())) > 1:  # Different checksums = data corruption
                    inconsistency_id = f"{data_type}_{key}_corruption_{int(time.time())}"
                    inconsistencies.append(InconsistencyReport(
                        inconsistency_id=inconsistency_id,
                        type=InconsistencyType.CORRUPTED_DATA,
                        severity=InconsistencySeverity.HIGH,
                        affected_layers=list(checksums.keys()),
                        description=f"Data corruption detected (checksum mismatch) for key: {key}",
                        affected_keys=[key],
                        expected_value="Matching checksums across layers",
                        actual_values=checksums,
                        discovered_at=datetime.utcnow()
                    ))

            # Timestamp consistency checks
            if "timestamp_match" in rules.get("consistency_checks", []):
                timestamps = {}
                if redis_entry:
                    timestamps["redis"] = redis_entry.get("retrieved_at")
                if qdrant_entry:
                    timestamps["qdrant"] = qdrant_entry.get("retrieved_at")
                if neo4j_entry:
                    timestamps["neo4j"] = neo4j_entry.get("retrieved_at")

                # Check if data is significantly out of sync (more than 1 hour difference)
                if len(timestamps) >= 2:
                    timestamp_values = [datetime.fromisoformat(ts) for ts in timestamps.values() if ts]
                    if timestamp_values:
                        max_diff = max(timestamp_values) - min(timestamp_values)
                        if max_diff > timedelta(hours=1):
                            inconsistency_id = f"{data_type}_{key}_stale_{int(time.time())}"
                            inconsistencies.append(InconsistencyReport(
                                inconsistency_id=inconsistency_id,
                                type=InconsistencyType.STALE_DATA,
                                severity=InconsistencySeverity.MEDIUM,
                                affected_layers=list(timestamps.keys()),
                                description=f"Stale data detected (timestamp mismatch > 1 hour) for key: {key}",
                                affected_keys=[key],
                                expected_value="Synchronized timestamps within 1 hour",
                                actual_values=timestamps,
                                discovered_at=datetime.utcnow()
                            ))

        # Store inconsistencies in reports
        for inc in inconsistencies:
            self.inconsistency_reports[inc.inconsistency_id] = inc

        return inconsistencies

    async def _repair_inconsistencies(self, inconsistencies: List[InconsistencyReport]) -> List[Dict[str, Any]]:
        """Attempt to repair detected inconsistencies"""
        repair_results = []

        for inconsistency in inconsistencies:
            repair_result = {
                "inconsistency_id": inconsistency.inconsistency_id,
                "type": inconsistency.type.value,
                "success": False,
                "action_taken": None,
                "error": None
            }

            try:
                if inconsistency.type == InconsistencyType.MISSING_DATA:
                    # Try to restore missing data from available layers
                    repair_result = await self._repair_missing_data(inconsistency)

                elif inconsistency.type == InconsistencyType.CORRUPTED_DATA:
                    # Use majority rule or most recent data to fix corruption
                    repair_result = await self._repair_corrupted_data(inconsistency)

                elif inconsistency.type == InconsistencyType.STALE_DATA:
                    # Synchronize timestamps and refresh stale data
                    repair_result = await self._repair_stale_data(inconsistency)

                if repair_result.get("success", False):
                    inconsistency.resolved = True
                    inconsistency.resolved_at = datetime.utcnow()
                    inconsistency.resolution_notes = repair_result.get("action_taken", "Auto-repaired")
                    self.stats["inconsistencies_repaired"] += 1

            except Exception as e:
                repair_result["error"] = str(e)
                logger.error(f"Failed to repair inconsistency {inconsistency.inconsistency_id}: {e}")

            repair_results.append(repair_result)

        return repair_results

    async def _repair_missing_data(self, inconsistency: InconsistencyReport) -> Dict[str, Any]:
        """Repair missing data inconsistency"""
        # Implementation would depend on specific business logic
        # This is a simplified example
        return {
            "inconsistency_id": inconsistency.inconsistency_id,
            "success": False,
            "action_taken": "Missing data repair not implemented",
            "note": "Requires manual intervention or specific business logic"
        }

    async def _repair_corrupted_data(self, inconsistency: InconsistencyReport) -> Dict[str, Any]:
        """Repair corrupted data inconsistency"""
        # Implementation would use majority rule or timestamp-based recovery
        return {
            "inconsistency_id": inconsistency.inconsistency_id,
            "success": False,
            "action_taken": "Corrupted data repair not implemented",
            "note": "Requires backup data or manual intervention"
        }

    async def _repair_stale_data(self, inconsistency: InconsistencyReport) -> Dict[str, Any]:
        """Repair stale data inconsistency"""
        # Implementation would refresh stale data from authoritative source
        return {
            "inconsistency_id": inconsistency.inconsistency_id,
            "success": False,
            "action_taken": "Stale data repair not implemented",
            "note": "Requires data refresh mechanism"
        }

    def _matches_pattern(self, key: str, pattern: str) -> bool:
        """Check if key matches Redis-style pattern"""
        # Simple pattern matching (could be enhanced with full glob support)
        if pattern.endswith("*"):
            return key.startswith(pattern[:-1])
        elif pattern.startswith("*"):
            return key.endswith(pattern[1:])
        else:
            return key == pattern

    async def _validation_scheduler(self):
        """Background scheduler for periodic validations"""
        while self.running:
            try:
                # Run full system validation periodically
                await asyncio.sleep(self.validation_interval)

                if self.running:
                    logger.info("Starting scheduled consistency validation")
                    await self.validate_system_consistency()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Scheduled validation failed: {e}")

    async def _monitoring_loop(self):
        """Monitor validation tasks and system health"""
        while self.running:
            try:
                # Check for long-running validation tasks
                current_time = datetime.utcnow()
                for task_id, task in list(self.active_tasks.items()):
                    task_age = (current_time - task.created_at).total_seconds()
                    if task_age > 3600 and task.status == ValidationStatus.IN_PROGRESS:  # 1 hour timeout
                        logger.warning(f"Validation task timeout: {task_id}")
                        task.status = ValidationStatus.FAILED
                        task.results["error"] = "Task timeout"

                await asyncio.sleep(60)  # Check every minute

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Monitoring loop error: {e}")

    def get_validation_status(self, task_id: str) -> Dict[str, Any]:
        """Get status of a validation task"""
        if task_id not in self.active_tasks:
            return {"error": "Task not found", "task_id": task_id}

        task = self.active_tasks[task_id]
        return {
            "task_id": task.task_id,
            "validation_type": task.validation_type,
            "status": task.status.value,
            "progress_percentage": task.progress_percentage,
            "created_at": task.created_at.isoformat(),
            "scope": task.scope,
            "inconsistencies_found": len(task.inconsistencies_found),
            "results": task.results
        }

    def get_consistency_report(self) -> Dict[str, Any]:
        """Get comprehensive consistency report"""
        active_inconsistencies = [
            inc for inc in self.inconsistency_reports.values()
            if not inc.resolved
        ]

        inconsistencies_by_type = {}
        inconsistencies_by_severity = {}

        for inc in active_inconsistencies:
            inc_type = inc.type.value
            inc_severity = inc.severity.value

            inconsistencies_by_type[inc_type] = inconsistencies_by_type.get(inc_type, 0) + 1
            inconsistencies_by_severity[inc_severity] = inconsistencies_by_severity.get(inc_severity, 0) + 1

        latest_metrics = self.consistency_history[-1] if self.consistency_history else None

        return {
            "timestamp": datetime.utcnow().isoformat(),
            "system_consistency_score": self.stats["system_consistency_score"],
            "active_inconsistencies": len(active_inconsistencies),
            "total_inconsistencies_detected": self.stats["inconsistencies_detected"],
            "inconsistencies_repaired": self.stats["inconsistencies_repaired"],
            "inconsistencies_by_type": inconsistencies_by_type,
            "inconsistencies_by_severity": inconsistencies_by_severity,
            "last_validation": self.stats["last_full_validation"].isoformat() if self.stats["last_full_validation"] else None,
            "active_validation_tasks": len(self.active_tasks),
            "latest_metrics": {
                "consistency_percentage": latest_metrics.consistency_percentage,
                "total_items_validated": latest_metrics.total_validated_items,
                "validation_duration_ms": latest_metrics.validation_duration_ms
            } if latest_metrics else None,
            "statistics": self.stats
        }

    def get_inconsistency_details(self, inconsistency_id: str) -> Dict[str, Any]:
        """Get detailed information about a specific inconsistency"""
        if inconsistency_id not in self.inconsistency_reports:
            return {"error": "Inconsistency not found"}

        inc = self.inconsistency_reports[inconsistency_id]
        return {
            "inconsistency_id": inc.inconsistency_id,
            "type": inc.type.value,
            "severity": inc.severity.value,
            "affected_layers": inc.affected_layers,
            "description": inc.description,
            "affected_keys": inc.affected_keys,
            "expected_value": inc.expected_value,
            "actual_values": inc.actual_values,
            "discovered_at": inc.discovered_at.isoformat(),
            "resolved": inc.resolved,
            "resolution_notes": inc.resolution_notes,
            "resolved_at": inc.resolved_at.isoformat() if inc.resolved_at else None
        }

    async def resolve_inconsistency(self, inconsistency_id: str, resolution_notes: str) -> bool:
        """Manually mark an inconsistency as resolved"""
        if inconsistency_id not in self.inconsistency_reports:
            return False

        inc = self.inconsistency_reports[inconsistency_id]
        inc.resolved = True
        inc.resolved_at = datetime.utcnow()
        inc.resolution_notes = resolution_notes

        logger.info(f"Inconsistency manually resolved: {inconsistency_id}")
        return True

# Global instance
consistency_validator = None

async def get_consistency_validator() -> ConsistencyValidationSystem:
    """Get singleton consistency validator instance"""
    global consistency_validator
    if not consistency_validator:
        consistency_validator = ConsistencyValidationSystem()
        await consistency_validator.start()
    return consistency_validator

if __name__ == "__main__":
    async def main():
        # Example usage
        validator = ConsistencyValidationSystem(validation_interval=60)  # 1 minute for testing
        await validator.start()

        # Run a validation
        task_id = await validator.validate_system_consistency()
        print(f"Started validation task: {task_id}")

        # Wait a bit and check status
        await asyncio.sleep(10)
        status = validator.get_validation_status(task_id)
        print("Validation status:", json.dumps(status, indent=2, default=str))

        # Get consistency report
        report = validator.get_consistency_report()
        print("Consistency report:", json.dumps(report, indent=2, default=str))

        await validator.stop()

    asyncio.run(main())

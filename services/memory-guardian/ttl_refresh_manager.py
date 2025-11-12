#!/usr/bin/env python3
"""
TTL Refresh Manager - Critical Memory System Component
Prevents context loss during active workflows by intelligently refreshing TTL values
and maintaining backup copies in persistent storage.

This component addresses the #1 critical gap: TTL expiration causing context loss.
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Set
from dataclasses import dataclass, field
from enum import Enum

import redis
import aiohttp
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, Distance, VectorParams

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class TTLPriority(Enum):
    """Priority levels for TTL refresh operations"""
    CRITICAL = 1    # Active workflows, must never expire
    HIGH = 2        # Agent coordination, project context
    MEDIUM = 3      # Cached computations, temporary results
    LOW = 4         # Historical data, analytics cache

class RefreshStrategy(Enum):
    """Different refresh strategies based on data type and usage"""
    ACTIVE_WORKFLOW = "active_workflow"      # Refresh every 30% of TTL
    PROJECT_CONTEXT = "project_context"      # Refresh when accessed + time-based
    AGENT_STATE = "agent_state"             # Refresh on agent activity
    COMPUTED_CACHE = "computed_cache"        # Refresh on cache hit
    BACKUP_ONLY = "backup_only"             # No refresh, just backup before expire

@dataclass
class TTLTrackingEntry:
    """Represents a Redis key being tracked for TTL management"""
    key: str
    priority: TTLPriority
    strategy: RefreshStrategy
    original_ttl: int
    current_ttl: int
    last_refreshed: datetime
    refresh_count: int = 0
    backup_location: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    access_pattern: List[datetime] = field(default_factory=list)

class TTLRefreshManager:
    """
    Intelligent TTL management system that prevents critical context loss

    Key Features:
    - Priority-based refresh scheduling
    - Activity-aware refresh strategies
    - Automatic backup to persistent storage
    - Context importance scoring
    - Graceful degradation under load
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        qdrant_url: str = "http://localhost:6333",
        backup_collection: str = "ttl_backup_storage",
        refresh_interval: int = 30,  # seconds
        max_concurrent_refreshes: int = 10
    ):
        self.redis_client = redis.from_url(redis_url, decode_responses=True)
        self.qdrant_client = QdrantClient(url=qdrant_url) if qdrant_url else None
        self.backup_collection = backup_collection
        self.refresh_interval = refresh_interval
        self.max_concurrent_refreshes = max_concurrent_refreshes

        # Tracking data structures
        self.tracked_keys: Dict[str, TTLTrackingEntry] = {}
        self.refresh_queue: asyncio.Queue = asyncio.Queue()
        self.active_refreshes: Set[str] = set()

        # Statistics and monitoring
        self.stats = {
            "keys_tracked": 0,
            "refreshes_performed": 0,
            "backups_created": 0,
            "keys_saved_from_expiry": 0,
            "errors_encountered": 0,
            "last_scan_time": None
        }

        # Task management
        self.refresh_task: Optional[asyncio.Task] = None
        self.monitor_task: Optional[asyncio.Task] = None
        self.running = False

        # Initialize backup storage
        self._initialize_backup_storage()

    def _initialize_backup_storage(self):
        """Initialize Qdrant collection for backup storage"""
        if not self.qdrant_client:
            logger.warning("Qdrant not available - backups will be disabled")
            return

        try:
            collections = self.qdrant_client.get_collections().collections
            collection_names = [c.name for c in collections]

            if self.backup_collection not in collection_names:
                self.qdrant_client.create_collection(
                    collection_name=self.backup_collection,
                    vectors_config=VectorParams(size=1, distance=Distance.COSINE)  # Minimal vector for storage
                )
                logger.info(f"Created backup collection: {self.backup_collection}")

        except Exception as e:
            logger.error(f"Failed to initialize backup storage: {e}")

    async def start(self):
        """Start the TTL refresh manager"""
        if self.running:
            logger.warning("TTL Refresh Manager already running")
            return

        logger.info("🔄 Starting TTL Refresh Manager")
        self.running = True

        # Start background tasks
        self.refresh_task = asyncio.create_task(self._refresh_worker())
        self.monitor_task = asyncio.create_task(self._monitoring_loop())

        logger.info("✅ TTL Refresh Manager started successfully")

    async def stop(self):
        """Stop the TTL refresh manager gracefully"""
        logger.info("🛑 Stopping TTL Refresh Manager")
        self.running = False

        # Cancel tasks
        if self.refresh_task:
            self.refresh_task.cancel()
        if self.monitor_task:
            self.monitor_task.cancel()

        # Wait for graceful shutdown
        await asyncio.sleep(1)
        logger.info("✅ TTL Refresh Manager stopped")

    def track_key(
        self,
        key: str,
        priority: TTLPriority = TTLPriority.MEDIUM,
        strategy: RefreshStrategy = RefreshStrategy.PROJECT_CONTEXT,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Add a Redis key to TTL tracking

        Args:
            key: Redis key to track
            priority: Priority level for refresh operations
            strategy: Refresh strategy to use
            metadata: Additional metadata about the key

        Returns:
            bool: True if successfully added to tracking
        """
        try:
            # Get current TTL from Redis
            current_ttl = self.redis_client.ttl(key)
            if current_ttl == -1:  # Key has no TTL
                logger.debug(f"Key {key} has no TTL, skipping tracking")
                return False
            elif current_ttl == -2:  # Key doesn't exist
                logger.debug(f"Key {key} doesn't exist, skipping tracking")
                return False

            # Create tracking entry
            entry = TTLTrackingEntry(
                key=key,
                priority=priority,
                strategy=strategy,
                original_ttl=current_ttl,
                current_ttl=current_ttl,
                last_refreshed=datetime.utcnow(),
                metadata=metadata or {},
                access_pattern=[]
            )

            self.tracked_keys[key] = entry
            self.stats["keys_tracked"] += 1

            logger.debug(f"Now tracking key: {key} (TTL: {current_ttl}s, Priority: {priority.name})")
            return True

        except Exception as e:
            logger.error(f"Failed to track key {key}: {e}")
            self.stats["errors_encountered"] += 1
            return False

    def untrack_key(self, key: str) -> bool:
        """Remove a key from TTL tracking"""
        if key in self.tracked_keys:
            del self.tracked_keys[key]
            self.stats["keys_tracked"] -= 1
            logger.debug(f"Stopped tracking key: {key}")
            return True
        return False

    def record_access(self, key: str):
        """Record that a key was accessed (influences refresh decisions)"""
        if key in self.tracked_keys:
            entry = self.tracked_keys[key]
            entry.access_pattern.append(datetime.utcnow())

            # Keep only recent access history (last 10 accesses)
            if len(entry.access_pattern) > 10:
                entry.access_pattern = entry.access_pattern[-10:]

    async def force_refresh(self, key: str) -> bool:
        """Force immediate refresh of a specific key"""
        if key not in self.tracked_keys:
            logger.warning(f"Key {key} not tracked, cannot force refresh")
            return False

        try:
            await self.refresh_queue.put(key)
            logger.info(f"Queued force refresh for key: {key}")
            return True
        except Exception as e:
            logger.error(f"Failed to queue force refresh for {key}: {e}")
            return False

    async def _monitoring_loop(self):
        """Main monitoring loop that scans tracked keys and queues refreshes"""
        while self.running:
            try:
                await self._scan_tracked_keys()
                self.stats["last_scan_time"] = datetime.utcnow()
                await asyncio.sleep(self.refresh_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                self.stats["errors_encountered"] += 1
                await asyncio.sleep(5)  # Brief pause before retry

    async def _scan_tracked_keys(self):
        """Scan all tracked keys and determine which need refreshing"""
        keys_to_refresh = []
        keys_to_remove = []

        for key, entry in self.tracked_keys.items():
            try:
                # Check if key still exists in Redis
                current_ttl = self.redis_client.ttl(key)

                if current_ttl == -2:  # Key expired or deleted
                    logger.warning(f"Key {key} no longer exists, removing from tracking")
                    keys_to_remove.append(key)
                    continue

                # Update current TTL
                entry.current_ttl = current_ttl

                # Determine if refresh is needed based on strategy
                needs_refresh = await self._should_refresh_key(entry)

                if needs_refresh:
                    keys_to_refresh.append(key)

            except Exception as e:
                logger.error(f"Error scanning key {key}: {e}")
                self.stats["errors_encountered"] += 1

        # Remove dead keys
        for key in keys_to_remove:
            self.untrack_key(key)

        # Queue refreshes based on priority
        keys_to_refresh.sort(key=lambda k: self.tracked_keys[k].priority.value)

        for key in keys_to_refresh:
            if self.refresh_queue.qsize() < 100:  # Prevent queue overflow
                await self.refresh_queue.put(key)

    async def _should_refresh_key(self, entry: TTLTrackingEntry) -> bool:
        """Determine if a key should be refreshed based on its strategy and current state"""

        # Critical priority keys - always refresh at 70% TTL
        if entry.priority == TTLPriority.CRITICAL:
            return entry.current_ttl < (entry.original_ttl * 0.7)

        # Strategy-specific logic
        if entry.strategy == RefreshStrategy.ACTIVE_WORKFLOW:
            # Refresh when TTL drops to 30% of original
            return entry.current_ttl < (entry.original_ttl * 0.3)

        elif entry.strategy == RefreshStrategy.PROJECT_CONTEXT:
            # Refresh based on access pattern and TTL
            recent_access = any(
                (datetime.utcnow() - access).seconds < 300  # Accessed in last 5 minutes
                for access in entry.access_pattern[-3:]  # Check last 3 accesses
            )
            return recent_access and entry.current_ttl < (entry.original_ttl * 0.5)

        elif entry.strategy == RefreshStrategy.AGENT_STATE:
            # Refresh when TTL drops to 40% and there's recent activity
            has_recent_activity = len(entry.access_pattern) > 0
            return has_recent_activity and entry.current_ttl < (entry.original_ttl * 0.4)

        elif entry.strategy == RefreshStrategy.COMPUTED_CACHE:
            # Only refresh if recently accessed
            recent_access = any(
                (datetime.utcnow() - access).seconds < 120  # Accessed in last 2 minutes
                for access in entry.access_pattern[-2:]
            )
            return recent_access and entry.current_ttl < (entry.original_ttl * 0.2)

        elif entry.strategy == RefreshStrategy.BACKUP_ONLY:
            # Don't refresh, but backup when TTL gets low
            if entry.current_ttl < 60 and not entry.backup_location:  # 1 minute left
                asyncio.create_task(self._backup_key(entry.key))
            return False

        return False

    async def _refresh_worker(self):
        """Background worker that processes refresh queue"""
        while self.running:
            try:
                # Wait for refresh requests
                key = await asyncio.wait_for(self.refresh_queue.get(), timeout=1.0)

                # Respect concurrency limits
                if len(self.active_refreshes) >= self.max_concurrent_refreshes:
                    await self.refresh_queue.put(key)  # Re-queue for later
                    await asyncio.sleep(0.1)
                    continue

                # Process refresh
                self.active_refreshes.add(key)
                asyncio.create_task(self._perform_refresh(key))

            except asyncio.TimeoutError:
                continue  # Normal timeout, continue loop
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in refresh worker: {e}")
                self.stats["errors_encountered"] += 1

    async def _perform_refresh(self, key: str):
        """Perform the actual TTL refresh operation"""
        try:
            if key not in self.tracked_keys:
                return

            entry = self.tracked_keys[key]

            # Create backup before refresh (safety measure)
            await self._backup_key(key)

            # Perform TTL refresh
            new_ttl = entry.original_ttl
            self.redis_client.expire(key, new_ttl)

            # Update tracking info
            entry.current_ttl = new_ttl
            entry.last_refreshed = datetime.utcnow()
            entry.refresh_count += 1

            # Update statistics
            self.stats["refreshes_performed"] += 1
            self.stats["keys_saved_from_expiry"] += 1

            logger.debug(f"Refreshed TTL for {key}: {new_ttl}s (refresh #{entry.refresh_count})")

        except Exception as e:
            logger.error(f"Failed to refresh TTL for key {key}: {e}")
            self.stats["errors_encountered"] += 1
        finally:
            self.active_refreshes.discard(key)

    async def _backup_key(self, key: str):
        """Create backup of key data in persistent storage"""
        if not self.qdrant_client:
            return

        try:
            # Get key data from Redis
            key_data = self.redis_client.get(key)
            if not key_data:
                return

            # Create backup entry
            backup_id = f"backup_{key}_{int(time.time())}"
            backup_payload = {
                "original_key": key,
                "data": key_data,
                "backed_up_at": datetime.utcnow().isoformat(),
                "ttl_at_backup": self.redis_client.ttl(key),
                "backup_reason": "ttl_refresh_safety"
            }

            # Store in Qdrant (using minimal vector)
            point = PointStruct(
                id=backup_id,
                vector=[0.0],  # Minimal vector since we're just using for storage
                payload=backup_payload
            )

            self.qdrant_client.upsert(
                collection_name=self.backup_collection,
                points=[point]
            )

            # Update tracking entry
            if key in self.tracked_keys:
                self.tracked_keys[key].backup_location = backup_id

            self.stats["backups_created"] += 1
            logger.debug(f"Created backup for key {key}: {backup_id}")

        except Exception as e:
            logger.error(f"Failed to backup key {key}: {e}")
            self.stats["errors_encountered"] += 1

    async def restore_from_backup(self, key: str, backup_id: Optional[str] = None) -> bool:
        """Restore a key from backup storage"""
        if not self.qdrant_client:
            logger.error("Cannot restore - Qdrant not available")
            return False

        try:
            if backup_id:
                # Restore specific backup
                result = self.qdrant_client.retrieve(
                    collection_name=self.backup_collection,
                    ids=[backup_id]
                )
            else:
                # Find most recent backup for this key
                search_results = self.qdrant_client.scroll(
                    collection_name=self.backup_collection,
                    scroll_filter={
                        "must": [
                            {"key": "original_key", "match": {"value": key}}
                        ]
                    },
                    limit=10
                )

                if not search_results[0]:  # No backups found
                    logger.warning(f"No backups found for key {key}")
                    return False

                # Get most recent backup
                result = [max(search_results[0], key=lambda p: p.payload["backed_up_at"])]

            if not result:
                logger.warning(f"Backup not found for key {key}")
                return False

            backup_data = result[0].payload

            # Restore to Redis
            self.redis_client.setex(
                key,
                backup_data["ttl_at_backup"],
                backup_data["data"]
            )

            logger.info(f"Successfully restored key {key} from backup {result[0].id}")
            return True

        except Exception as e:
            logger.error(f"Failed to restore key {key} from backup: {e}")
            return False

    def get_statistics(self) -> Dict[str, Any]:
        """Get current TTL refresh manager statistics"""
        return {
            **self.stats,
            "tracked_keys_count": len(self.tracked_keys),
            "refresh_queue_size": self.refresh_queue.qsize(),
            "active_refreshes_count": len(self.active_refreshes),
            "running": self.running,
            "tracked_keys_by_priority": {
                priority.name: len([e for e in self.tracked_keys.values() if e.priority == priority])
                for priority in TTLPriority
            },
            "tracked_keys_by_strategy": {
                strategy.name: len([e for e in self.tracked_keys.values() if e.strategy == strategy])
                for strategy in RefreshStrategy
            }
        }

    async def get_health_status(self) -> Dict[str, Any]:
        """Get detailed health status of TTL refresh system"""
        try:
            redis_healthy = self.redis_client.ping()
            qdrant_healthy = bool(self.qdrant_client and self.qdrant_client.get_collections())

            # Check for keys at risk of expiry
            keys_at_risk = []
            for key, entry in self.tracked_keys.items():
                if entry.current_ttl < 60:  # Less than 1 minute
                    keys_at_risk.append({
                        "key": key,
                        "ttl": entry.current_ttl,
                        "priority": entry.priority.name
                    })

            return {
                "overall_health": "HEALTHY" if redis_healthy else "UNHEALTHY",
                "redis_connection": "OK" if redis_healthy else "FAILED",
                "qdrant_connection": "OK" if qdrant_healthy else "FAILED",
                "keys_at_risk": keys_at_risk,
                "error_rate": self.stats["errors_encountered"] / max(1, self.stats["refreshes_performed"]) * 100,
                "last_scan": self.stats["last_scan_time"].isoformat() if self.stats["last_scan_time"] else None,
                "statistics": self.get_statistics()
            }

        except Exception as e:
            return {
                "overall_health": "ERROR",
                "error": str(e),
                "statistics": self.get_statistics()
            }

# Example usage and integration helpers
async def integrate_with_chief_architect(ttl_manager: TTLRefreshManager):
    """Helper function to integrate TTL manager with ChiefArchitect"""

    # Track workflow contexts with high priority
    workflow_keys = ["active_workflow:*", "project_context:*"]

    for pattern in workflow_keys:
        # In real implementation, would scan Redis for matching keys
        # and add them with appropriate priority/strategy
        pass

# Global instance for easy import
ttl_refresh_manager = None

async def get_ttl_manager() -> TTLRefreshManager:
    """Get singleton TTL refresh manager instance"""
    global ttl_refresh_manager
    if not ttl_refresh_manager:
        ttl_refresh_manager = TTLRefreshManager()
        await ttl_refresh_manager.start()
    return ttl_refresh_manager

if __name__ == "__main__":
    async def main():
        # Example usage
        manager = TTLRefreshManager()
        await manager.start()

        # Track some example keys
        manager.track_key("workflow:active_123", TTLPriority.CRITICAL, RefreshStrategy.ACTIVE_WORKFLOW)
        manager.track_key("project_context:test_project", TTLPriority.HIGH, RefreshStrategy.PROJECT_CONTEXT)

        # Run for a while
        await asyncio.sleep(60)

        # Show statistics
        print("Final statistics:", manager.get_statistics())

        await manager.stop()

    asyncio.run(main())

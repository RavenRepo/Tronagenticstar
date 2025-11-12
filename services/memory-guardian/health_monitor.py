#!/usr/bin/env python3
"""
Health Monitoring System - Critical Memory System Component
Provides real-time monitoring, alerting, and diagnostics for all three memory layers.

This component addresses the #3 critical gap: No real-time memory system health tracking.
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum

import redis
import aiohttp
from qdrant_client import QdrantClient
from neo4j import AsyncGraphDatabase

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class HealthStatus(Enum):
    """Health status levels"""
    HEALTHY = "healthy"
    WARNING = "warning"
    CRITICAL = "critical"
    UNKNOWN = "unknown"
    OFFLINE = "offline"

class AlertSeverity(Enum):
    """Alert severity levels"""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    EMERGENCY = "emergency"

@dataclass
class HealthMetric:
    """Individual health metric"""
    name: str
    value: Any
    status: HealthStatus
    threshold_warning: Optional[float] = None
    threshold_critical: Optional[float] = None
    unit: str = ""
    description: str = ""
    last_updated: datetime = field(default_factory=datetime.utcnow)

@dataclass
class ComponentHealth:
    """Health status for a system component"""
    component: str
    overall_status: HealthStatus
    metrics: Dict[str, HealthMetric]
    last_check: datetime
    response_time_ms: float
    error_count: int = 0
    uptime_seconds: float = 0
    additional_info: Dict[str, Any] = field(default_factory=dict)

@dataclass
class HealthAlert:
    """Health monitoring alert"""
    alert_id: str
    component: str
    metric: str
    severity: AlertSeverity
    message: str
    current_value: Any
    threshold: Any
    created_at: datetime
    acknowledged: bool = False
    resolved: bool = False
    resolved_at: Optional[datetime] = None

class HealthMonitoringSystem:
    """
    Comprehensive health monitoring for Constella memory system

    Features:
    - Real-time monitoring of Redis, Qdrant, Neo4j
    - Performance metrics tracking
    - Automatic alerting and notifications
    - Health trend analysis
    - Automated recovery suggestions
    - Dashboard-ready metrics export
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        qdrant_url: str = "http://localhost:6333",
        neo4j_url: str = "bolt://localhost:7687",
        check_interval: int = 30,  # seconds
        alert_threshold: int = 3,   # consecutive failures before alert
        retention_hours: int = 24   # metrics retention period
    ):
        # Connection configuration
        self.redis_url = redis_url
        self.qdrant_url = qdrant_url
        self.neo4j_url = neo4j_url
        self.check_interval = check_interval
        self.alert_threshold = alert_threshold
        self.retention_hours = retention_hours

        # System clients
        self.redis_client: Optional[redis.Redis] = None
        self.qdrant_client: Optional[QdrantClient] = None
        self.neo4j_driver = None

        # Monitoring state
        self.component_health: Dict[str, ComponentHealth] = {}
        self.active_alerts: Dict[str, HealthAlert] = {}
        self.metrics_history: Dict[str, List[Dict[str, Any]]] = {
            "redis": [],
            "qdrant": [],
            "neo4j": [],
            "system": []
        }

        # Statistics and tracking
        self.monitoring_stats = {
            "checks_performed": 0,
            "alerts_generated": 0,
            "components_monitored": 0,
            "uptime_start": datetime.utcnow(),
            "last_full_check": None,
            "check_failures": 0
        }

        # Background tasks
        self.monitor_task: Optional[asyncio.Task] = None
        self.cleanup_task: Optional[asyncio.Task] = None
        self.running = False

        # Alert callbacks
        self.alert_callbacks: List[Callable[[HealthAlert], None]] = []

        # Health check definitions
        self._initialize_health_checks()

    def _initialize_health_checks(self):
        """Initialize health check configurations"""
        self.health_checks = {
            "redis": {
                "connectivity": {"warning": 100, "critical": 1000, "unit": "ms"},
                "memory_usage": {"warning": 80, "critical": 95, "unit": "%"},
                "connected_clients": {"warning": 100, "critical": 200, "unit": "count"},
                "keyspace_hits_ratio": {"warning": 80, "critical": 60, "unit": "%"},
                "expired_keys": {"warning": 1000, "critical": 5000, "unit": "count/min"}
            },
            "qdrant": {
                "connectivity": {"warning": 200, "critical": 2000, "unit": "ms"},
                "collections_count": {"warning": 50, "critical": 100, "unit": "count"},
                "disk_usage": {"warning": 80, "critical": 95, "unit": "%"},
                "search_latency": {"warning": 500, "critical": 2000, "unit": "ms"},
                "index_errors": {"warning": 1, "critical": 10, "unit": "count"}
            },
            "neo4j": {
                "connectivity": {"warning": 200, "critical": 2000, "unit": "ms"},
                "memory_usage": {"warning": 80, "critical": 95, "unit": "%"},
                "active_transactions": {"warning": 50, "critical": 100, "unit": "count"},
                "page_cache_hits": {"warning": 80, "critical": 60, "unit": "%"},
                "node_count": {"warning": 1000000, "critical": 5000000, "unit": "count"}
            }
        }

    async def start(self):
        """Start the health monitoring system"""
        if self.running:
            logger.warning("Health monitoring system already running")
            return

        logger.info("🔍 Starting Health Monitoring System")
        self.running = True

        # Initialize connections
        await self._initialize_connections()

        # Start background tasks
        self.monitor_task = asyncio.create_task(self._monitoring_loop())
        self.cleanup_task = asyncio.create_task(self._cleanup_old_metrics())

        logger.info("✅ Health Monitoring System started successfully")

    async def stop(self):
        """Stop the health monitoring system"""
        logger.info("🛑 Stopping Health Monitoring System")
        self.running = False

        # Cancel background tasks
        if self.monitor_task:
            self.monitor_task.cancel()
        if self.cleanup_task:
            self.cleanup_task.cancel()

        # Close connections
        await self._close_connections()

        logger.info("✅ Health Monitoring System stopped")

    async def _initialize_connections(self):
        """Initialize connections to monitored systems"""
        # Redis connection
        try:
            self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
            self.redis_client.ping()  # Test connection
            logger.info("✅ Redis connection established")
        except Exception as e:
            logger.error(f"❌ Failed to connect to Redis: {e}")
            self.redis_client = None

        # Qdrant connection
        try:
            self.qdrant_client = QdrantClient(url=self.qdrant_url)
            self.qdrant_client.get_collections()  # Test connection
            logger.info("✅ Qdrant connection established")
        except Exception as e:
            logger.error(f"❌ Failed to connect to Qdrant: {e}")
            self.qdrant_client = None

        # Neo4j connection
        try:
            self.neo4j_driver = AsyncGraphDatabase.driver(self.neo4j_url)
            # Test connection
            async with self.neo4j_driver.session() as session:
                await session.run("RETURN 1")
            logger.info("✅ Neo4j connection established")
        except Exception as e:
            logger.error(f"❌ Failed to connect to Neo4j: {e}")
            self.neo4j_driver = None

    async def _close_connections(self):
        """Close all connections"""
        if self.neo4j_driver:
            await self.neo4j_driver.close()

    async def _monitoring_loop(self):
        """Main monitoring loop"""
        while self.running:
            try:
                start_time = time.time()

                # Perform health checks for all components
                await self._check_all_components()

                # Update statistics
                self.monitoring_stats["checks_performed"] += 1
                self.monitoring_stats["last_full_check"] = datetime.utcnow()
                self.monitoring_stats["components_monitored"] = len(self.component_health)

                # Calculate check duration and wait
                check_duration = time.time() - start_time
                sleep_time = max(0, self.check_interval - check_duration)

                await asyncio.sleep(sleep_time)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                self.monitoring_stats["check_failures"] += 1
                await asyncio.sleep(5)  # Brief pause before retry

    async def _check_all_components(self):
        """Perform health checks on all monitored components"""
        check_tasks = []

        if self.redis_client:
            check_tasks.append(self._check_redis_health())

        if self.qdrant_client:
            check_tasks.append(self._check_qdrant_health())

        if self.neo4j_driver:
            check_tasks.append(self._check_neo4j_health())

        # Execute all health checks concurrently
        if check_tasks:
            await asyncio.gather(*check_tasks, return_exceptions=True)

        # Analyze overall system health
        await self._analyze_system_health()

    async def _check_redis_health(self):
        """Check Redis health and performance metrics"""
        component = "redis"
        start_time = time.time()
        metrics = {}

        try:
            # Basic connectivity test
            ping_start = time.time()
            self.redis_client.ping()
            response_time = (time.time() - ping_start) * 1000

            metrics["connectivity"] = HealthMetric(
                name="connectivity",
                value=response_time,
                status=self._evaluate_metric_status(response_time, self.health_checks[component]["connectivity"]),
                threshold_warning=self.health_checks[component]["connectivity"]["warning"],
                threshold_critical=self.health_checks[component]["connectivity"]["critical"],
                unit="ms",
                description="Redis connection response time"
            )

            # Get Redis info
            redis_info = self.redis_client.info()

            # Memory usage
            used_memory = redis_info.get("used_memory", 0)
            total_system_memory = redis_info.get("total_system_memory", 1)
            memory_usage_pct = (used_memory / total_system_memory) * 100 if total_system_memory > 0 else 0

            metrics["memory_usage"] = HealthMetric(
                name="memory_usage",
                value=memory_usage_pct,
                status=self._evaluate_metric_status(memory_usage_pct, self.health_checks[component]["memory_usage"]),
                threshold_warning=self.health_checks[component]["memory_usage"]["warning"],
                threshold_critical=self.health_checks[component]["memory_usage"]["critical"],
                unit="%",
                description="Redis memory usage percentage"
            )

            # Connected clients
            connected_clients = redis_info.get("connected_clients", 0)
            metrics["connected_clients"] = HealthMetric(
                name="connected_clients",
                value=connected_clients,
                status=self._evaluate_metric_status(connected_clients, self.health_checks[component]["connected_clients"]),
                threshold_warning=self.health_checks[component]["connected_clients"]["warning"],
                threshold_critical=self.health_checks[component]["connected_clients"]["critical"],
                unit="count",
                description="Number of connected Redis clients"
            )

            # Keyspace hit ratio
            keyspace_hits = redis_info.get("keyspace_hits", 0)
            keyspace_misses = redis_info.get("keyspace_misses", 0)
            total_commands = keyspace_hits + keyspace_misses
            hit_ratio = (keyspace_hits / total_commands) * 100 if total_commands > 0 else 100

            metrics["keyspace_hits_ratio"] = HealthMetric(
                name="keyspace_hits_ratio",
                value=hit_ratio,
                status=self._evaluate_metric_status(hit_ratio, self.health_checks[component]["keyspace_hits_ratio"], inverse=True),
                threshold_warning=self.health_checks[component]["keyspace_hits_ratio"]["warning"],
                threshold_critical=self.health_checks[component]["keyspace_hits_ratio"]["critical"],
                unit="%",
                description="Redis keyspace hit ratio"
            )

            # Overall component status
            overall_status = self._determine_overall_status([m.status for m in metrics.values()])

            # Update component health
            self.component_health[component] = ComponentHealth(
                component=component,
                overall_status=overall_status,
                metrics=metrics,
                last_check=datetime.utcnow(),
                response_time_ms=response_time,
                uptime_seconds=redis_info.get("uptime_in_seconds", 0),
                additional_info={
                    "redis_version": redis_info.get("redis_version", "unknown"),
                    "role": redis_info.get("role", "unknown"),
                    "keyspace_keys": sum(redis_info.get(db, {}).get("keys", 0) for db in redis_info.keys() if db.startswith("db"))
                }
            )

            # Store metrics history
            self._store_metrics_history(component, metrics)

        except Exception as e:
            logger.error(f"Redis health check failed: {e}")
            self._handle_component_failure(component, str(e))

    async def _check_qdrant_health(self):
        """Check Qdrant health and performance metrics"""
        component = "qdrant"
        start_time = time.time()
        metrics = {}

        try:
            # Basic connectivity test
            ping_start = time.time()
            collections = self.qdrant_client.get_collections()
            response_time = (time.time() - ping_start) * 1000

            metrics["connectivity"] = HealthMetric(
                name="connectivity",
                value=response_time,
                status=self._evaluate_metric_status(response_time, self.health_checks[component]["connectivity"]),
                threshold_warning=self.health_checks[component]["connectivity"]["warning"],
                threshold_critical=self.health_checks[component]["connectivity"]["critical"],
                unit="ms",
                description="Qdrant connection response time"
            )

            # Collections count
            collections_count = len(collections.collections)
            metrics["collections_count"] = HealthMetric(
                name="collections_count",
                value=collections_count,
                status=self._evaluate_metric_status(collections_count, self.health_checks[component]["collections_count"]),
                threshold_warning=self.health_checks[component]["collections_count"]["warning"],
                threshold_critical=self.health_checks[component]["collections_count"]["critical"],
                unit="count",
                description="Number of Qdrant collections"
            )

            # Test search performance on first available collection
            search_latency = 0
            total_points = 0
            if collections.collections:
                try:
                    test_collection = collections.collections[0].name
                    search_start = time.time()
                    # Perform a simple search test
                    result = self.qdrant_client.scroll(collection_name=test_collection, limit=1)
                    search_latency = (time.time() - search_start) * 1000

                    # Get collection info
                    collection_info = self.qdrant_client.get_collection(test_collection)
                    total_points = collection_info.points_count or 0
                except Exception as e:
                    logger.debug(f"Qdrant search test failed: {e}")

            metrics["search_latency"] = HealthMetric(
                name="search_latency",
                value=search_latency,
                status=self._evaluate_metric_status(search_latency, self.health_checks[component]["search_latency"]),
                threshold_warning=self.health_checks[component]["search_latency"]["warning"],
                threshold_critical=self.health_checks[component]["search_latency"]["critical"],
                unit="ms",
                description="Qdrant search operation latency"
            )

            # Overall component status
            overall_status = self._determine_overall_status([m.status for m in metrics.values()])

            # Update component health
            self.component_health[component] = ComponentHealth(
                component=component,
                overall_status=overall_status,
                metrics=metrics,
                last_check=datetime.utcnow(),
                response_time_ms=response_time,
                additional_info={
                    "collections_count": collections_count,
                    "total_points": total_points,
                    "collections": [c.name for c in collections.collections]
                }
            )

            # Store metrics history
            self._store_metrics_history(component, metrics)

        except Exception as e:
            logger.error(f"Qdrant health check failed: {e}")
            self._handle_component_failure(component, str(e))

    async def _check_neo4j_health(self):
        """Check Neo4j health and performance metrics"""
        component = "neo4j"
        start_time = time.time()
        metrics = {}

        try:
            async with self.neo4j_driver.session() as session:
                # Basic connectivity test
                ping_start = time.time()
                await session.run("RETURN 1")
                response_time = (time.time() - ping_start) * 1000

                metrics["connectivity"] = HealthMetric(
                    name="connectivity",
                    value=response_time,
                    status=self._evaluate_metric_status(response_time, self.health_checks[component]["connectivity"]),
                    threshold_warning=self.health_checks[component]["connectivity"]["warning"],
                    threshold_critical=self.health_checks[component]["connectivity"]["critical"],
                    unit="ms",
                    description="Neo4j connection response time"
                )

                # Get database metrics
                try:
                    # Node count
                    result = await session.run("MATCH (n) RETURN count(n) as node_count")
                    record = await result.single()
                    node_count = record["node_count"] if record else 0

                    metrics["node_count"] = HealthMetric(
                        name="node_count",
                        value=node_count,
                        status=self._evaluate_metric_status(node_count, self.health_checks[component]["node_count"]),
                        threshold_warning=self.health_checks[component]["node_count"]["warning"],
                        threshold_critical=self.health_checks[component]["node_count"]["critical"],
                        unit="count",
                        description="Total number of nodes in Neo4j database"
                    )

                    # Active transactions (if available)
                    try:
                        result = await session.run("CALL dbms.listTransactions()")
                        transactions = [record async for record in result]
                        active_transactions = len(transactions)

                        metrics["active_transactions"] = HealthMetric(
                            name="active_transactions",
                            value=active_transactions,
                            status=self._evaluate_metric_status(active_transactions, self.health_checks[component]["active_transactions"]),
                            threshold_warning=self.health_checks[component]["active_transactions"]["warning"],
                            threshold_critical=self.health_checks[component]["active_transactions"]["critical"],
                            unit="count",
                            description="Number of active Neo4j transactions"
                        )
                    except Exception:
                        # Some Neo4j editions might not support this
                        metrics["active_transactions"] = HealthMetric(
                            name="active_transactions",
                            value=0,
                            status=HealthStatus.UNKNOWN,
                            unit="count",
                            description="Active transactions (unavailable)"
                        )

                except Exception as e:
                    logger.debug(f"Neo4j detailed metrics failed: {e}")

            # Overall component status
            overall_status = self._determine_overall_status([m.status for m in metrics.values()])

            # Update component health
            self.component_health[component] = ComponentHealth(
                component=component,
                overall_status=overall_status,
                metrics=metrics,
                last_check=datetime.utcnow(),
                response_time_ms=response_time,
                additional_info={
                    "database_available": True,
                    "node_count": metrics.get("node_count", HealthMetric("", 0, HealthStatus.UNKNOWN)).value
                }
            )

            # Store metrics history
            self._store_metrics_history(component, metrics)

        except Exception as e:
            logger.error(f"Neo4j health check failed: {e}")
            self._handle_component_failure(component, str(e))

    def _evaluate_metric_status(self, value: float, thresholds: Dict[str, float], inverse: bool = False) -> HealthStatus:
        """Evaluate metric status based on thresholds"""
        try:
            warning_threshold = thresholds["warning"]
            critical_threshold = thresholds["critical"]

            if inverse:  # For metrics where lower values are worse (e.g., hit ratio)
                if value <= critical_threshold:
                    return HealthStatus.CRITICAL
                elif value <= warning_threshold:
                    return HealthStatus.WARNING
                else:
                    return HealthStatus.HEALTHY
            else:  # For metrics where higher values are worse (e.g., latency, memory usage)
                if value >= critical_threshold:
                    return HealthStatus.CRITICAL
                elif value >= warning_threshold:
                    return HealthStatus.WARNING
                else:
                    return HealthStatus.HEALTHY

        except (KeyError, TypeError, ValueError):
            return HealthStatus.UNKNOWN

    def _determine_overall_status(self, metric_statuses: List[HealthStatus]) -> HealthStatus:
        """Determine overall component status from individual metrics"""
        if not metric_statuses:
            return HealthStatus.UNKNOWN

        if HealthStatus.CRITICAL in metric_statuses:
            return HealthStatus.CRITICAL
        elif HealthStatus.WARNING in metric_statuses:
            return HealthStatus.WARNING
        elif HealthStatus.OFFLINE in metric_statuses:
            return HealthStatus.OFFLINE
        elif all(status == HealthStatus.HEALTHY for status in metric_statuses):
            return HealthStatus.HEALTHY
        else:
            return HealthStatus.WARNING

    def _store_metrics_history(self, component: str, metrics: Dict[str, HealthMetric]):
        """Store metrics in history for trend analysis"""
        timestamp = datetime.utcnow()

        history_entry = {
            "timestamp": timestamp.isoformat(),
            "metrics": {
                name: {
                    "value": metric.value,
                    "status": metric.status.value,
                    "unit": metric.unit
                }
                for name, metric in metrics.items()
            }
        }

        self.metrics_history[component].append(history_entry)

        # Limit history size to prevent memory bloat
        max_entries = int(self.retention_hours * 3600 / self.check_interval)  # entries for retention period
        if len(self.metrics_history[component]) > max_entries:
            self.metrics_history[component] = self.metrics_history[component][-max_entries:]

    def _handle_component_failure(self, component: str, error_message: str):
        """Handle component failure by updating health status and generating alerts"""
        self.component_health[component] = ComponentHealth(
            component=component,
            overall_status=HealthStatus.OFFLINE,
            metrics={},
            last_check=datetime.utcnow(),
            response_time_ms=0,
            error_count=self.component_health.get(component, ComponentHealth("", HealthStatus.UNKNOWN, {}, datetime.utcnow(), 0)).error_count + 1,
            additional_info={"error": error_message}
        )

        # Generate critical alert
        self._generate_alert(
            component=component,
            metric="connectivity",
            severity=AlertSeverity.CRITICAL,
            message=f"Component {component} is offline: {error_message}",
            current_value="offline",
            threshold="online"
        )

    def _generate_alert(self, component: str, metric: str, severity: AlertSeverity, message: str, current_value: Any, threshold: Any):
        """Generate and process health alert"""
        alert_id = f"{component}_{metric}_{int(time.time())}"

        alert = HealthAlert(
            alert_id=alert_id,
            component=component,
            metric=metric,
            severity=severity,
            message=message,
            current_value=current_value,
            threshold=threshold,
            created_at=datetime.utcnow()
        )

        self.active_alerts[alert_id] = alert
        self.monitoring_stats["alerts_generated"] += 1

        # Execute alert callbacks
        for callback in self.alert_callbacks:
            try:
                callback(alert)
            except Exception as e:
                logger.error(f"Alert callback failed: {e}")

        logger.warning(f"🚨 HEALTH ALERT [{severity.value.upper()}]: {message}")

    async def _analyze_system_health(self):
        """Analyze overall system health and generate insights"""
        total_components = len(self.component_health)
        if total_components == 0:
            return

        healthy_components = sum(1 for health in self.component_health.values() if health.overall_status == HealthStatus.HEALTHY)
        warning_components = sum(1 for health in self.component_health.values() if health.overall_status == HealthStatus.WARNING)
        critical_components = sum(1 for health in self.component_health.values() if health.overall_status == HealthStatus.CRITICAL)
        offline_components = sum(1 for health in self.component_health.values() if health.overall_status == HealthStatus.OFFLINE)

        # Determine system-wide health status
        if offline_components > 0 or critical_components >= total_components / 2:
            system_status = HealthStatus.CRITICAL
        elif critical_components > 0 or warning_components >= total_components / 2:
            system_status = HealthStatus.WARNING
        else:
            system_status = HealthStatus.HEALTHY

        # Store system-wide metrics
        system_metrics = {
            "timestamp": datetime.utcnow().isoformat(),
            "system_status": system_status.value,
            "total_components": total_components,
            "healthy_components": healthy_components,
            "warning_components": warning_components,
            "critical_components": critical_components,
            "offline_components": offline_components,
            "active_alerts": len(self.active_alerts),
            "health_percentage": (healthy_components / total_components) * 100
        }

        self.metrics_history["system"].append(system_metrics)

        # Limit system metrics history
        max_entries = int(self.retention_hours * 3600 / self.check_interval)
        if len(self.metrics_history["system"]) > max_entries:
            self.metrics_history["system"] = self.metrics_history["system"][-max_entries:]

    async def _cleanup_old_metrics(self):
        """Clean up old metrics data"""
        while self.running:
            try:
                # Run cleanup every hour
                await asyncio.sleep(3600)

                cutoff_time = datetime.utcnow() - timedelta(hours=self.retention_hours)

                # Clean up metrics history
                for component in self.metrics_history:
                    original_count = len(self.metrics_history[component])
                    self.metrics_history[component] = [
                        entry for entry in self.metrics_history[component]
                        if datetime.fromisoformat(entry["timestamp"]) > cutoff_time
                    ]
                    cleaned_count = original_count - len(self.metrics_history[component])
                    if cleaned_count > 0:
                        logger.debug(f"Cleaned up {cleaned_count} old metrics for {component}")

                # Clean up resolved alerts older than 24 hours
                old_alert_cutoff = datetime.utcnow() - timedelta(hours=24)
                old_alerts = [
                    alert_id for alert_id, alert in self.active_alerts.items()
                    if alert.resolved and alert.resolved_at and alert.resolved_at < old_alert_cutoff
                ]
                for alert_id in old_alerts:
                    del self.active_alerts[alert_id]

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Metrics cleanup failed: {e}")

    def add_alert_callback(self, callback: Callable[[HealthAlert], None]):
        """Add callback function for alert notifications"""
        self.alert_callbacks.append(callback)

    def remove_alert_callback(self, callback: Callable[[HealthAlert], None]):
        """Remove alert callback function"""
        if callback in self.alert_callbacks:
            self.alert_callbacks.remove(callback)

    def acknowledge_alert(self, alert_id: str) -> bool:
        """Acknowledge an active alert"""
        if alert_id in self.active_alerts:
            self.active_alerts[alert_id].acknowledged = True
            logger.info(f"Alert acknowledged: {alert_id}")
            return True
        return False

    def resolve_alert(self, alert_id: str) -> bool:
        """Mark an alert as resolved"""
        if alert_id in self.active_alerts:
            alert = self.active_alerts[alert_id]
            alert.resolved = True
            alert.resolved_at = datetime.utcnow()
            logger.info(f"Alert resolved: {alert_id}")
            return True
        return False

    def get_health_status(self) -> Dict[str, Any]:
        """Get current health status of all monitored components"""
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "components": {
                name: {
                    "status": health.overall_status.value,
                    "last_check": health.last_check.isoformat(),
                    "response_time_ms": health.response_time_ms,
                    "error_count": health.error_count,
                    "uptime_seconds": health.uptime_seconds,
                    "metrics": {
                        metric_name: {
                            "value": metric.value,
                            "status": metric.status.value,
                            "unit": metric.unit,
                            "description": metric.description
                        }
                        for metric_name, metric in health.metrics.items()
                    },
                    "additional_info": health.additional_info
                }
                for name, health in self.component_health.items()
            },
            "active_alerts": [
                {
                    "alert_id": alert.alert_id,
                    "component": alert.component,
                    "metric": alert.metric,
                    "severity": alert.severity.value,
                    "message": alert.message,
                    "current_value": alert.current_value,
                    "threshold": alert.threshold,
                    "created_at": alert.created_at.isoformat(),
                    "acknowledged": alert.acknowledged,
                    "resolved": alert.resolved
                }
                for alert in self.active_alerts.values()
                if not alert.resolved
            ],
            "statistics": self.monitoring_stats
        }

    def get_metrics_history(self, component: Optional[str] = None, hours: int = 1) -> Dict[str, Any]:
        """Get historical metrics data"""
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)

        if component:
            if component in self.metrics_history:
                return {
                    component: [
                        entry for entry in self.metrics_history[component]
                        if datetime.fromisoformat(entry["timestamp"]) > cutoff_time
                    ]
                }
            else:
                return {component: []}
        else:
            return {
                comp: [
                    entry for entry in history
                    if datetime.fromisoformat(entry["timestamp"]) > cutoff_time
                ]
                for comp, history in self.metrics_history.items()
            }

    def get_health_summary(self) -> Dict[str, Any]:
        """Get concise health summary for dashboards"""
        if not self.component_health:
            return {"status": "unknown", "message": "No health data available"}

        status_counts = {}
        for status in HealthStatus:
            status_counts[status.value] = sum(
                1 for health in self.component_health.values()
                if health.overall_status == status
            )

        # Determine overall system health
        if status_counts.get("critical", 0) > 0 or status_counts.get("offline", 0) > 0:
            overall_status = "critical"
            message = f"{status_counts.get('critical', 0)} critical, {status_counts.get('offline', 0)} offline"
        elif status_counts.get("warning", 0) > 0:
            overall_status = "warning"
            message = f"{status_counts.get('warning', 0)} components with warnings"
        else:
            overall_status = "healthy"
            message = "All components operating normally"

        return {
            "status": overall_status,
            "message": message,
            "components_total": len(self.component_health),
            "components_healthy": status_counts.get("healthy", 0),
            "active_alerts": len([a for a in self.active_alerts.values() if not a.resolved]),
            "last_check": self.monitoring_stats["last_full_check"].isoformat() if self.monitoring_stats["last_full_check"] else None,
            "uptime_hours": (datetime.utcnow() - self.monitoring_stats["uptime_start"]).total_seconds() / 3600
        }

# Global instance
health_monitor = None

async def get_health_monitor() -> HealthMonitoringSystem:
    """Get singleton health monitor instance"""
    global health_monitor
    if not health_monitor:
        health_monitor = HealthMonitoringSystem()
        await health_monitor.start()
    return health_monitor

# Example alert callback functions
def console_alert_callback(alert: HealthAlert):
    """Example console alert callback"""
    severity_emoji = {
        AlertSeverity.INFO: "ℹ️",
        AlertSeverity.WARNING: "⚠️",
        AlertSeverity.CRITICAL: "🚨",
        AlertSeverity.EMERGENCY: "🆘"
    }

    emoji = severity_emoji.get(alert.severity, "🔔")
    print(f"{emoji} [{alert.severity.value.upper()}] {alert.component}.{alert.metric}: {alert.message}")

async def webhook_alert_callback(alert: HealthAlert):
    """Example webhook alert callback"""
    webhook_url = os.getenv("HEALTH_ALERT_WEBHOOK")
    if not webhook_url:
        return

    payload = {
        "alert_id": alert.alert_id,
        "component": alert.component,
        "metric": alert.metric,
        "severity": alert.severity.value,
        "message": alert.message,
        "current_value": str(alert.current_value),
        "threshold": str(alert.threshold),
        "timestamp": alert.created_at.isoformat()
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(webhook_url, json=payload) as response:
                if response.status == 200:
                    logger.debug(f"Alert webhook sent successfully: {alert.alert_id}")
                else:
                    logger.error(f"Alert webhook failed: {response.status}")
    except Exception as e:
        logger.error(f"Alert webhook error: {e}")

if __name__ == "__main__":
    async def main():
        # Example usage
        monitor = HealthMonitoringSystem(check_interval=10)

        # Add alert callbacks
        monitor.add_alert_callback(console_alert_callback)

        await monitor.start()

        # Run for a while
        await asyncio.sleep(60)

        # Print health status
        status = monitor.get_health_status()
        print("Health Status:", json.dumps(status, indent=2, default=str))

        await monitor.stop()

    asyncio.run(main())

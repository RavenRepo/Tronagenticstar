#!/usr/bin/env python3
"""
Memory Guardian Service - Integrated Memory System Management
Combines all critical memory system components into a unified service:
1. TTL Refresh Manager - Prevents context loss during active workflows
2. Backup Recovery Service - Comprehensive backup/recovery for all memory layers
3. Health Monitoring System - Real-time memory system health tracking
4. Consistency Validator - Cross-layer data consistency validation

This service fills all critical implementation gaps identified in the memory system audit.
"""

import asyncio
import json
import logging
import os
import signal
import time
from datetime import datetime
from typing import Dict, List, Any, Optional
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

# Import our memory guardian components
from ttl_refresh_manager import TTLRefreshManager, TTLPriority, RefreshStrategy
from backup_recovery_service import BackupRecoveryService, BackupType, RecoveryStrategy
from health_monitor import HealthMonitoringSystem, HealthAlert, AlertSeverity
from consistency_validator import ConsistencyValidationSystem, InconsistencyType

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Security
security = HTTPBearer()

# Pydantic Models for API
class TTLTrackingRequest(BaseModel):
    key: str
    priority: str = "MEDIUM"  # CRITICAL, HIGH, MEDIUM, LOW
    strategy: str = "PROJECT_CONTEXT"  # ACTIVE_WORKFLOW, PROJECT_CONTEXT, etc.
    metadata: Dict[str, Any] = {}

class BackupRequest(BaseModel):
    backup_type: str = "FULL"  # FULL, INCREMENTAL, SNAPSHOT, EMERGENCY
    components: List[str] = ["redis", "qdrant", "neo4j"]
    tags: Dict[str, str] = {}

class RestoreRequest(BaseModel):
    backup_id: str
    strategy: str = "FULL_RESTORE"  # FULL_RESTORE, SELECTIVE_RESTORE, etc.
    components: List[str] = ["redis", "qdrant", "neo4j"]
    target_timestamp: Optional[str] = None

class ValidationRequest(BaseModel):
    scope: List[str] = ["redis", "qdrant", "neo4j"]
    repair_inconsistencies: bool = True
    target_keys: Optional[List[str]] = None

class MemoryGuardianService:
    """
    Unified Memory Guardian Service that manages all memory system components
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        qdrant_url: str = "http://localhost:6333",
        neo4j_url: str = "bolt://localhost:7687",
        backup_path: str = "/data/backups/constella"
    ):
        # Core components
        self.ttl_manager: Optional[TTLRefreshManager] = None
        self.backup_service: Optional[BackupRecoveryService] = None
        self.health_monitor: Optional[HealthMonitoringSystem] = None
        self.consistency_validator: Optional[ConsistencyValidationSystem] = None

        # Configuration
        self.redis_url = redis_url
        self.qdrant_url = qdrant_url
        self.neo4j_url = neo4j_url
        self.backup_path = backup_path

        # Service state
        self.running = False
        self.start_time = datetime.utcnow()

        # Statistics
        self.service_stats = {
            "service_uptime_seconds": 0,
            "total_api_requests": 0,
            "errors_encountered": 0,
            "components_healthy": 0,
            "last_health_check": None
        }

    async def initialize(self):
        """Initialize all memory guardian components"""
        logger.info("🛡️  Initializing Memory Guardian Service")

        try:
            # Initialize TTL Refresh Manager
            self.ttl_manager = TTLRefreshManager(
                redis_url=self.redis_url,
                qdrant_url=self.qdrant_url,
                refresh_interval=30,
                max_concurrent_refreshes=10
            )
            await self.ttl_manager.start()
            logger.info("✅ TTL Refresh Manager initialized")

            # Initialize Backup Recovery Service
            self.backup_service = BackupRecoveryService(
                redis_url=self.redis_url,
                qdrant_url=self.qdrant_url,
                neo4j_url=self.neo4j_url,
                backup_base_path=self.backup_path,
                max_concurrent_backups=3,
                retention_days=30
            )
            await self.backup_service.start()
            logger.info("✅ Backup Recovery Service initialized")

            # Initialize Health Monitoring System
            self.health_monitor = HealthMonitoringSystem(
                redis_url=self.redis_url,
                qdrant_url=self.qdrant_url,
                neo4j_url=self.neo4j_url,
                check_interval=30,
                alert_threshold=3,
                retention_hours=24
            )
            await self.health_monitor.start()
            logger.info("✅ Health Monitoring System initialized")

            # Initialize Consistency Validation System
            self.consistency_validator = ConsistencyValidationSystem(
                redis_url=self.redis_url,
                qdrant_url=self.qdrant_url,
                neo4j_url=self.neo4j_url,
                validation_interval=3600,  # 1 hour
                repair_mode=True,
                max_concurrent_validations=5
            )
            await self.consistency_validator.start()
            logger.info("✅ Consistency Validation System initialized")

            # Set up alert callbacks
            self.health_monitor.add_alert_callback(self._handle_health_alert)

            self.running = True
            logger.info("🚀 Memory Guardian Service fully operational")

        except Exception as e:
            logger.error(f"❌ Failed to initialize Memory Guardian Service: {e}")
            raise

    async def shutdown(self):
        """Gracefully shutdown all components"""
        logger.info("🛑 Shutting down Memory Guardian Service")

        try:
            if self.ttl_manager:
                await self.ttl_manager.stop()
                logger.info("✅ TTL Manager stopped")

            if self.backup_service:
                await self.backup_service.stop()
                logger.info("✅ Backup Service stopped")

            if self.health_monitor:
                await self.health_monitor.stop()
                logger.info("✅ Health Monitor stopped")

            if self.consistency_validator:
                await self.consistency_validator.stop()
                logger.info("✅ Consistency Validator stopped")

            self.running = False
            logger.info("✅ Memory Guardian Service shutdown complete")

        except Exception as e:
            logger.error(f"Error during shutdown: {e}")

    def _handle_health_alert(self, alert: HealthAlert):
        """Handle health alerts from the monitoring system"""
        severity_emoji = {
            AlertSeverity.INFO: "ℹ️",
            AlertSeverity.WARNING: "⚠️",
            AlertSeverity.CRITICAL: "🚨",
            AlertSeverity.EMERGENCY: "🆘"
        }

        emoji = severity_emoji.get(alert.severity, "🔔")
        logger.warning(
            f"{emoji} MEMORY ALERT [{alert.severity.value.upper()}] "
            f"{alert.component}.{alert.metric}: {alert.message}"
        )

        # Auto-repair actions based on alert type
        if alert.severity in [AlertSeverity.CRITICAL, AlertSeverity.EMERGENCY]:
            if alert.component in ["redis", "qdrant", "neo4j"]:
                # Trigger emergency backup
                asyncio.create_task(self._emergency_backup(alert.component))

    async def _emergency_backup(self, component: str):
        """Perform emergency backup when critical alerts are detected"""
        try:
            logger.info(f"🚨 Triggering emergency backup for {component}")
            backup_id = await self.backup_service.create_backup(
                backup_type=BackupType.EMERGENCY,
                components=[component],
                tags={"trigger": "critical_alert", "component": component}
            )
            logger.info(f"✅ Emergency backup completed: {backup_id}")
        except Exception as e:
            logger.error(f"❌ Emergency backup failed for {component}: {e}")

    async def get_service_status(self) -> Dict[str, Any]:
        """Get comprehensive service status"""
        uptime = (datetime.utcnow() - self.start_time).total_seconds()

        # Get component statuses
        component_status = {}

        if self.ttl_manager:
            component_status["ttl_manager"] = self.ttl_manager.get_statistics()

        if self.backup_service:
            component_status["backup_service"] = self.backup_service.get_backup_status()

        if self.health_monitor:
            component_status["health_monitor"] = self.health_monitor.get_health_summary()

        if self.consistency_validator:
            component_status["consistency_validator"] = self.consistency_validator.get_consistency_report()

        return {
            "service_name": "Memory Guardian",
            "version": "1.0.0",
            "status": "operational" if self.running else "stopped",
            "uptime_seconds": uptime,
            "start_time": self.start_time.isoformat(),
            "components": component_status,
            "statistics": self.service_stats
        }

# Global service instance
memory_guardian: Optional[MemoryGuardianService] = None

# FastAPI app with lifespan management
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    global memory_guardian

    # Startup
    logger.info("🚀 Starting Memory Guardian API")
    memory_guardian = MemoryGuardianService(
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        qdrant_url=os.getenv("QDRANT_URL", "http://localhost:6333"),
        neo4j_url=os.getenv("NEO4J_URL", "bolt://localhost:7687"),
        backup_path=os.getenv("BACKUP_PATH", "/data/backups/constella")
    )

    await memory_guardian.initialize()

    yield

    # Shutdown
    if memory_guardian:
        await memory_guardian.shutdown()

# Create FastAPI app
app = FastAPI(
    title="Memory Guardian Service",
    description="Comprehensive memory system management for Constella AI Platform",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Authentication
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify API access token"""
    expected_token = os.getenv("MEMORY_GUARDIAN_TOKEN")
    if expected_token and credentials.credentials != expected_token:
        raise HTTPException(status_code=401, detail="Invalid access token")
    return credentials

# API Routes

@app.get("/health")
async def health_check():
    """Service health check"""
    if not memory_guardian or not memory_guardian.running:
        raise HTTPException(status_code=503, detail="Service not available")

    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

@app.get("/status")
async def get_status(credentials = Depends(verify_token)):
    """Get comprehensive service status"""
    if not memory_guardian:
        raise HTTPException(status_code=503, detail="Service not initialized")

    return await memory_guardian.get_service_status()

# TTL Management Endpoints

@app.post("/ttl/track")
async def track_key_ttl(request: TTLTrackingRequest, credentials = Depends(verify_token)):
    """Add key to TTL tracking"""
    if not memory_guardian or not memory_guardian.ttl_manager:
        raise HTTPException(status_code=503, detail="TTL Manager not available")

    try:
        priority = getattr(TTLPriority, request.priority.upper())
        strategy = getattr(RefreshStrategy, request.strategy.upper())

        success = memory_guardian.ttl_manager.track_key(
            key=request.key,
            priority=priority,
            strategy=strategy,
            metadata=request.metadata
        )

        return {"success": success, "key": request.key, "tracked": success}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/ttl/track/{key}")
async def untrack_key_ttl(key: str, credentials = Depends(verify_token)):
    """Remove key from TTL tracking"""
    if not memory_guardian or not memory_guardian.ttl_manager:
        raise HTTPException(status_code=503, detail="TTL Manager not available")

    success = memory_guardian.ttl_manager.untrack_key(key)
    return {"success": success, "key": key, "untracked": success}

@app.post("/ttl/refresh/{key}")
async def force_refresh_ttl(key: str, credentials = Depends(verify_token)):
    """Force TTL refresh for specific key"""
    if not memory_guardian or not memory_guardian.ttl_manager:
        raise HTTPException(status_code=503, detail="TTL Manager not available")

    success = await memory_guardian.ttl_manager.force_refresh(key)
    return {"success": success, "key": key, "refreshed": success}

@app.get("/ttl/status")
async def get_ttl_status(credentials = Depends(verify_token)):
    """Get TTL manager status and statistics"""
    if not memory_guardian or not memory_guardian.ttl_manager:
        raise HTTPException(status_code=503, detail="TTL Manager not available")

    return memory_guardian.ttl_manager.get_statistics()

# Backup & Recovery Endpoints

@app.post("/backup/create")
async def create_backup(request: BackupRequest, background_tasks: BackgroundTasks, credentials = Depends(verify_token)):
    """Create system backup"""
    if not memory_guardian or not memory_guardian.backup_service:
        raise HTTPException(status_code=503, detail="Backup Service not available")

    try:
        backup_type = getattr(BackupType, request.backup_type.upper())
        backup_id = await memory_guardian.backup_service.create_backup(
            backup_type=backup_type,
            components=request.components,
            tags=request.tags
        )

        return {"backup_id": backup_id, "status": "created", "components": request.components}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/backup/restore")
async def restore_backup(request: RestoreRequest, credentials = Depends(verify_token)):
    """Restore from backup"""
    if not memory_guardian or not memory_guardian.backup_service:
        raise HTTPException(status_code=503, detail="Backup Service not available")

    try:
        strategy = getattr(RecoveryStrategy, request.strategy.upper())
        target_timestamp = None
        if request.target_timestamp:
            target_timestamp = datetime.fromisoformat(request.target_timestamp)

        success = await memory_guardian.backup_service.restore_from_backup(
            backup_id=request.backup_id,
            strategy=strategy,
            components=request.components,
            target_timestamp=target_timestamp
        )

        return {"success": success, "backup_id": request.backup_id, "restored": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/backup/status")
async def get_backup_status(credentials = Depends(verify_token)):
    """Get backup service status"""
    if not memory_guardian or not memory_guardian.backup_service:
        raise HTTPException(status_code=503, detail="Backup Service not available")

    return memory_guardian.backup_service.get_backup_status()

@app.get("/backup/recovery-options")
async def get_recovery_options(credentials = Depends(verify_token)):
    """Get available recovery options"""
    if not memory_guardian or not memory_guardian.backup_service:
        raise HTTPException(status_code=503, detail="Backup Service not available")

    return await memory_guardian.backup_service.get_recovery_options()

# Health Monitoring Endpoints

@app.get("/health/detailed")
async def get_detailed_health(credentials = Depends(verify_token)):
    """Get detailed health status of all components"""
    if not memory_guardian or not memory_guardian.health_monitor:
        raise HTTPException(status_code=503, detail="Health Monitor not available")

    return memory_guardian.health_monitor.get_health_status()

@app.get("/health/summary")
async def get_health_summary(credentials = Depends(verify_token)):
    """Get concise health summary"""
    if not memory_guardian or not memory_guardian.health_monitor:
        raise HTTPException(status_code=503, detail="Health Monitor not available")

    return memory_guardian.health_monitor.get_health_summary()

@app.get("/health/metrics/history")
async def get_metrics_history(component: str = None, hours: int = 1, credentials = Depends(verify_token)):
    """Get historical metrics data"""
    if not memory_guardian or not memory_guardian.health_monitor:
        raise HTTPException(status_code=503, detail="Health Monitor not available")

    return memory_guardian.health_monitor.get_metrics_history(component=component, hours=hours)

@app.post("/health/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, credentials = Depends(verify_token)):
    """Acknowledge a health alert"""
    if not memory_guardian or not memory_guardian.health_monitor:
        raise HTTPException(status_code=503, detail="Health Monitor not available")

    success = memory_guardian.health_monitor.acknowledge_alert(alert_id)
    return {"success": success, "alert_id": alert_id, "acknowledged": success}

# Consistency Validation Endpoints

@app.post("/consistency/validate")
async def validate_consistency(request: ValidationRequest, credentials = Depends(verify_token)):
    """Start consistency validation"""
    if not memory_guardian or not memory_guardian.consistency_validator:
        raise HTTPException(status_code=503, detail="Consistency Validator not available")

    try:
        if request.target_keys:
            task_id = await memory_guardian.consistency_validator.validate_specific_keys(
                keys=request.target_keys,
                repair_inconsistencies=request.repair_inconsistencies
            )
        else:
            task_id = await memory_guardian.consistency_validator.validate_system_consistency(
                scope=request.scope,
                repair_inconsistencies=request.repair_inconsistencies
            )

        return {"task_id": task_id, "status": "started", "scope": request.scope}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/consistency/validation/{task_id}")
async def get_validation_status(task_id: str, credentials = Depends(verify_token)):
    """Get validation task status"""
    if not memory_guardian or not memory_guardian.consistency_validator:
        raise HTTPException(status_code=503, detail="Consistency Validator not available")

    return memory_guardian.consistency_validator.get_validation_status(task_id)

@app.get("/consistency/report")
async def get_consistency_report(credentials = Depends(verify_token)):
    """Get comprehensive consistency report"""
    if not memory_guardian or not memory_guardian.consistency_validator:
        raise HTTPException(status_code=503, detail="Consistency Validator not available")

    return memory_guardian.consistency_validator.get_consistency_report()

@app.get("/consistency/inconsistency/{inconsistency_id}")
async def get_inconsistency_details(inconsistency_id: str, credentials = Depends(verify_token)):
    """Get detailed information about specific inconsistency"""
    if not memory_guardian or not memory_guardian.consistency_validator:
        raise HTTPException(status_code=503, detail="Consistency Validator not available")

    return memory_guardian.consistency_validator.get_inconsistency_details(inconsistency_id)

# Utility Endpoints

@app.get("/metrics")
async def get_prometheus_metrics():
    """Get Prometheus-compatible metrics"""
    if not memory_guardian:
        return "# Memory Guardian not initialized\n"

    status = await memory_guardian.get_service_status()

    metrics = [
        "# HELP memory_guardian_uptime_seconds Service uptime in seconds",
        "# TYPE memory_guardian_uptime_seconds counter",
        f"memory_guardian_uptime_seconds {status['uptime_seconds']}",
        "",
        "# HELP memory_guardian_components_healthy Number of healthy components",
        "# TYPE memory_guardian_components_healthy gauge",
    ]

    # Add component-specific metrics
    for component, data in status.get("components", {}).items():
        if isinstance(data, dict) and "statistics" in data:
            stats = data["statistics"]
            for metric, value in stats.items():
                if isinstance(value, (int, float)):
                    metrics.extend([
                        f"# HELP memory_guardian_{component}_{metric} {component} {metric}",
                        f"# TYPE memory_guardian_{component}_{metric} gauge",
                        f"memory_guardian_{component}_{metric} {value}",
                        ""
                    ])

    return "\n".join(metrics)

# Error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    if memory_guardian:
        memory_guardian.service_stats["errors_encountered"] += 1

    return {"error": "Internal server error", "detail": str(exc)}

# Signal handlers for graceful shutdown
def signal_handler(signum, frame):
    logger.info(f"Received signal {signum}, initiating graceful shutdown")
    if memory_guardian:
        asyncio.create_task(memory_guardian.shutdown())

signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

if __name__ == "__main__":
    # Configuration
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8019))
    log_level = os.getenv("LOG_LEVEL", "info")
    reload = os.getenv("NODE_ENV") != "production"

    # Run the service
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        log_level=log_level,
        reload=reload,
        access_log=True
    )

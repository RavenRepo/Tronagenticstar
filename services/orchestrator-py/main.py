"""
Constella Chief Architect Orchestrator
Coordinates specialized AI agents for comprehensive software development analysis
"""

import os
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, validator
import httpx
import jwt


# Configure logging
import logging
import json
from datetime import datetime

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_data)

logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    
# Disable uvicorn default access log formatting if it exists
logging.getLogger("uvicorn.access").handlers = []


# Security
security = HTTPBearer()

# Pydantic Models for Request Validation
class AnalysisRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=100000, description="Code to analyze")
    project_context: Optional[str] = Field(None, max_length=10000, description="Additional project context")
    analysis_type: str = Field("comprehensive", regex="^(architecture|security|quality|comprehensive)$")
    priority: str = Field("normal", regex="^(low|normal|high|urgent)$")

    @validator('code')
    def validate_code(cls, v):
        if not v.strip():
            raise ValueError('Code cannot be empty')
        return v.strip()

class AgentExecutionRequest(BaseModel):
    agent_name: str = Field(..., regex="^[a-zA-Z0-9_-]+$", description="Name of the agent to execute")
    action: str = Field(..., min_length=1, max_length=100, description="Action to perform")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Parameters for the action")
    timeout_seconds: int = Field(30, ge=5, le=300, description="Execution timeout")

class WorkflowRequest(BaseModel):
    workflow_type: str = Field(..., regex="^(analysis|security_scan|quality_check|full_audit)$")
    target: str = Field(..., min_length=1, max_length=1000, description="Target for the workflow")
    configuration: Dict[str, Any] = Field(default_factory=dict, description="Workflow configuration")

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    timestamp: str
    agents_available: int
    uptime_seconds: float

class AnalysisResponse(BaseModel):
    request_id: str
    status: str
    results: Dict[str, Any]
    execution_time_ms: int
    agents_used: List[str]
    timestamp: str

# Application lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown"""
    logger.info("🚀 Chief Architect Orchestrator starting up...")

    # Initialize HTTP client
    app.state.http_client = httpx.AsyncClient(timeout=30.0)

    # Test agent connectivity
    await test_agent_connectivity()

    logger.info("✅ Chief Architect Orchestrator ready")
    yield

    logger.info("🛑 Chief Architect Orchestrator shutting down...")
    await app.state.http_client.aclose()

# Create FastAPI app
app = FastAPI(
    title="Constella Chief Architect Orchestrator",
    description="Coordinates specialized AI agents for software development analysis",
    version="2.1.0",
    lifespan=lifespan
)

# CORS Configuration - Secure in production
allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

# Strict CORS in production
if os.getenv("NODE_ENV") == "production":
    cors_origins = [origin.strip() for origin in allowed_origins if origin.strip() != "*"]
    if not cors_origins:
        logger.error("CRITICAL: No valid CORS origins configured for production")
        raise ValueError("Invalid CORS configuration for production")
else:
    cors_origins = ["http://localhost:3000", "http://localhost:3001", "http://localhost:8080"]
    logger.warning("Development CORS policy active")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Agent Registry
AGENT_REGISTRY = {
    "architecture": {
        "url": "http://localhost:8010",
        "capabilities": ["analyze_architecture", "suggest_patterns", "evaluate_design"],
        "timeout": 30
    },
    "security": {
        "url": "http://localhost:8011",
        "capabilities": ["scan_vulnerabilities", "check_compliance", "audit_permissions"],
        "timeout": 45
    },
    "quality": {
        "url": "http://localhost:8012",
        "capabilities": ["check_quality", "suggest_improvements", "calculate_metrics"],
        "timeout": 30
    }
}

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send WebSocket message: {e}")
                self.disconnect(connection)

manager = ConnectionManager()

# Authentication
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token for protected endpoints"""
    try:
        jwt_secret = os.getenv("JWT_SECRET")
        if not jwt_secret:
            raise HTTPException(status_code=500, detail="JWT secret not configured")

        payload = jwt.decode(credentials.credentials, jwt_secret, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Helper Functions
async def test_agent_connectivity():
    """Test connectivity to all registered agents"""
    for agent_name, agent_config in AGENT_REGISTRY.items():
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{agent_config['url']}/health")
                if response.status_code == 200:
                    logger.info(f"✅ Agent {agent_name} is healthy")
                else:
                    logger.warning(f"⚠️ Agent {agent_name} returned status {response.status_code}")
        except Exception as e:
            logger.error(f"❌ Agent {agent_name} is unreachable: {e}")

async def execute_agent_action(agent_name: str, action: str, parameters: dict, timeout: int = 30) -> dict:
    """Execute an action on a specific agent with proper error handling"""
    if agent_name not in AGENT_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Agent {agent_name} not found")

    agent_config = AGENT_REGISTRY[agent_name]
    url = f"{agent_config['url']}/{action}"

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=parameters)

            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Agent {agent_name} returned error: {response.status_code}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Agent {agent_name} execution failed"
                )

    except httpx.TimeoutException:
        logger.error(f"Agent {agent_name} execution timed out after {timeout}s")
        raise HTTPException(status_code=408, detail="Agent execution timeout")
    except Exception as e:
        logger.error(f"Agent {agent_name} execution failed: {e}")
        raise HTTPException(status_code=500, detail="Agent execution error")

# API Endpoints
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint (public)"""
    return HealthResponse(
        status="healthy",
        service="chief-architect-orchestrator",
        version="2.1.0",
        timestamp=datetime.utcnow().isoformat(),
        agents_available=len(AGENT_REGISTRY),
        uptime_seconds=0.0  # TODO: Track actual uptime
    )

@app.get("/agents")
async def list_agents(token_data: dict = Depends(verify_token)):
    """List all available agents and their capabilities"""
    return {
        "agents": AGENT_REGISTRY,
        "total": len(AGENT_REGISTRY),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_code(
    request: AnalysisRequest,
    token_data: dict = Depends(verify_token)
):
    """Perform comprehensive code analysis using multiple agents"""
    start_time = asyncio.get_event_loop().time()
    request_id = f"req_{int(start_time * 1000)}"

    logger.info(f"Starting analysis {request_id} for {len(request.code)} characters of code")

    try:
        results = {}
        agents_used = []

        # Determine which agents to use based on analysis type
        if request.analysis_type in ["architecture", "comprehensive"]:
            try:
                arch_result = await execute_agent_action(
                    "architecture",
                    "analyze",
                    {"code": request.code, "context": request.project_context},
                    timeout=30
                )
                results["architecture"] = arch_result
                agents_used.append("architecture")
            except Exception as e:
                logger.error(f"Architecture analysis failed: {e}")
                results["architecture"] = {"error": str(e), "status": "failed"}

        if request.analysis_type in ["security", "comprehensive"]:
            try:
                sec_result = await execute_agent_action(
                    "security",
                    "scan",
                    {"code": request.code, "context": request.project_context},
                    timeout=45
                )
                results["security"] = sec_result
                agents_used.append("security")
            except Exception as e:
                logger.error(f"Security analysis failed: {e}")
                results["security"] = {"error": str(e), "status": "failed"}

        if request.analysis_type in ["quality", "comprehensive"]:
            try:
                quality_result = await execute_agent_action(
                    "quality",
                    "check",
                    {"code": request.code, "context": request.project_context},
                    timeout=30
                )
                results["quality"] = quality_result
                agents_used.append("quality")
            except Exception as e:
                logger.error(f"Quality analysis failed: {e}")
                results["quality"] = {"error": str(e), "status": "failed"}

        end_time = asyncio.get_event_loop().time()
        execution_time_ms = int((end_time - start_time) * 1000)

        # Broadcast progress via WebSocket
        await manager.broadcast({
            "type": "analysis_complete",
            "request_id": request_id,
            "agents_used": agents_used,
            "execution_time_ms": execution_time_ms
        })

        return AnalysisResponse(
            request_id=request_id,
            status="completed",
            results=results,
            execution_time_ms=execution_time_ms,
            agents_used=agents_used,
            timestamp=datetime.utcnow().isoformat()
        )

    except Exception as e:
        logger.error(f"Analysis {request_id} failed: {e}")
        end_time = asyncio.get_event_loop().time()
        execution_time_ms = int((end_time - start_time) * 1000)

        raise HTTPException(
            status_code=500,
            detail={
                "error": "Analysis failed",
                "message": str(e),
                "request_id": request_id,
                "execution_time_ms": execution_time_ms
            }
        )

@app.post("/agents/{agent_name}/execute")
async def execute_agent(
    agent_name: str,
    request: AgentExecutionRequest,
    token_data: dict = Depends(verify_token)
):
    """Execute a specific action on a named agent"""
    logger.info(f"Executing {request.action} on agent {agent_name}")

    try:
        result = await execute_agent_action(
            agent_name,
            request.action,
            request.parameters,
            request.timeout_seconds
        )

        return {
            "status": "success",
            "agent": agent_name,
            "action": request.action,
            "result": result,
            "timestamp": datetime.utcnow().isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Agent execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates"""
    await manager.connect(websocket)
    logger.info("WebSocket client connected")

    try:
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            logger.info(f"WebSocket message received: {data}")

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)

# Development endpoints (only in development)
if os.getenv("NODE_ENV") != "production":
    @app.get("/dev/status")
    async def dev_status():
        """Development status endpoint"""
        return {
            "environment": "development",
            "agents": AGENT_REGISTRY,
            "cors_origins": cors_origins,
            "timestamp": datetime.utcnow().isoformat()
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=os.getenv("NODE_ENV") != "production",
        log_level="info"
    )

"""
Chief Architect Orchestrator - Enterprise AI Operating Platform
Core intelligence system that decomposes high-level tasks into orchestrated multi-agent workflows
Integrates with Neo4j, Qdrant, and Redis for persistent context awareness

Run locally:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi import Request
from pydantic import BaseModel, Field
import errorgold  # noqa: E402
from chief_architect import ChiefArchitectAgent, TaskType, TaskPriority, ProjectContext
import json
import asyncio
from typing import Set

try:
    # LangGraph is optional at this stage; fallback to noop if missing
    import langgraph  # type: ignore
except ImportError:  # pragma: no cover
    langgraph = None  # noqa: N816  # camel-case external name

langgraph_app = None  # placeholder

try:
    if langgraph:
        from langgraph.graph import StateGraph, END

        def echo_node(state: dict):
            return {"result": state["parameters"], "processed_by": "echo-node"}

        workflow = StateGraph()
        workflow.add_node("echo", echo_node)
        workflow.set_entry_point("echo")
        workflow.set_finish_point(END)
        langgraph_app = workflow.compile()
except Exception as e:  # pragma: no cover
    print("Failed to init LangGraph DAG", e)

# ---------------------------------------------------------------------------
# Pydantic models - Enhanced for Chief Architect integration
# ---------------------------------------------------------------------------

class HighLevelTaskRequest(BaseModel):
    task_description: str = Field(..., description="Natural language description of the task")
    task_type: str = Field(..., description="Type of task: feature_development, bug_fix, security_audit, etc.")
    project_id: Optional[str] = Field(None, description="Project identifier for context")
    priority: int = Field(5, ge=1, le=10, description="Priority level (1=critical, 10=low)")
    requirements: Dict[str, Any] = Field(default_factory=dict, description="Additional requirements and context")
    technology_stack: List[str] = Field(default_factory=list, description="Technology stack for the project")

class TaskRequest(BaseModel):
    """Legacy task request format for backward compatibility"""
    task_type: str = Field(..., alias="task_type")
    parameters: Dict[str, Any] = Field(default_factory=dict)
    priority: int = 5

class WorkflowResponse(BaseModel):
    workflow_id: str
    total_subtasks: int
    subtasks: List[Dict[str, Any]]
    estimated_duration_minutes: int
    status: str = "created"

class TaskResponse(BaseModel):
    id: str
    status: str = "completed"
    received_at: datetime
    result: Dict[str, Any]

class WorkflowStatusResponse(BaseModel):
    workflow_id: str
    status: str
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    pending_tasks: int
    tasks: List[Dict[str, Any]]


# ---------------------------------------------------------------------------
# Initialize Chief Architect Agent
# ---------------------------------------------------------------------------

# Environment configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
NEO4J_URL = os.getenv("NEO4J_URL", "bolt://neo4j:7687")
QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
AGENT_BEARER_TOKEN = os.getenv("AGENT_BEARER")

# Global Chief Architect instance
chief_architect: Optional[ChiefArchitectAgent] = None

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        try:
            await websocket.send_text(message)
        except:
            self.disconnect(websocket)

    async def broadcast(self, message: str):
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                disconnected.add(connection)

        # Remove disconnected connections
        for connection in disconnected:
            self.disconnect(connection)

manager = ConnectionManager()

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Constella Chief Architect Orchestrator",
    description="Enterprise AI Operating Platform - Intelligent Task Orchestration",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Initialize Chief Architect Agent on startup"""
    global chief_architect
    try:
        chief_architect = ChiefArchitectAgent(
            redis_url=REDIS_URL,
            neo4j_url=NEO4J_URL,
            qdrant_url=QDRANT_URL,
            agent_bearer_token=AGENT_BEARER_TOKEN
        )
        print("Chief Architect Agent initialized successfully")
    except Exception as e:
        print(f"Failed to initialize Chief Architect Agent: {e}")
        # Continue without Chief Architect for backward compatibility

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    global chief_architect
    if chief_architect:
        await chief_architect.close()

async def get_chief_architect() -> ChiefArchitectAgent:
    """Dependency to get Chief Architect instance"""
    if not chief_architect:
        raise HTTPException(status_code=503, detail="Chief Architect not available")
    return chief_architect


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler with error reporting"""
    asyncio.create_task(errorgold.publish_error(exc, {"path": str(request.url)}))
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal Server Error",
            "error_id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat()
        }
    )


@app.post("/orchestrate", response_model=WorkflowResponse)
async def orchestrate_high_level_task(
    payload: HighLevelTaskRequest,
    background_tasks: BackgroundTasks,
    architect: ChiefArchitectAgent = Depends(get_chief_architect)
):
    """
    Main orchestration endpoint - transforms high-level requirements into multi-agent workflows
    """

    # Validate priority
    if payload.priority < 1 or payload.priority > 10:
        raise HTTPException(status_code=422, detail="priority must be 1-10")

    try:
        # Map string task type to enum
        task_type_mapping = {
            "feature_development": TaskType.FEATURE_DEVELOPMENT,
            "bug_fix": TaskType.BUG_FIX,
            "security_audit": TaskType.SECURITY_AUDIT,
            "performance_optimization": TaskType.PERFORMANCE_OPTIMIZATION,
            "code_review": TaskType.CODE_REVIEW,
            "refactoring": TaskType.REFACTORING,
            "documentation": TaskType.DOCUMENTATION,
            "testing": TaskType.TESTING,
        }

        task_type = task_type_mapping.get(payload.task_type.lower())
        if not task_type:
            raise HTTPException(
                status_code=422,
                detail=f"Unsupported task type: {payload.task_type}. Supported: {list(task_type_mapping.keys())}"
            )

        # Map priority to enum
        priority_mapping = {1: TaskPriority.CRITICAL, 2: TaskPriority.HIGH, 3: TaskPriority.HIGH,
                           4: TaskPriority.MEDIUM, 5: TaskPriority.MEDIUM, 6: TaskPriority.MEDIUM,
                           7: TaskPriority.LOW, 8: TaskPriority.LOW, 9: TaskPriority.LOW, 10: TaskPriority.LOW}
        priority = priority_mapping.get(payload.priority, TaskPriority.MEDIUM)

        # Create project context if provided
        project_context = None
        if payload.project_id or payload.technology_stack or payload.requirements:
            project_context = ProjectContext(
                project_id=payload.project_id or "default_project",
                name=payload.requirements.get("project_name", "Constella Project"),
                technology_stack=payload.technology_stack,
                coding_standards=payload.requirements.get("coding_standards", {}),
                security_policies=payload.requirements.get("security_policies", []),
                performance_requirements=payload.requirements.get("performance_requirements", {}),
                quality_gates=payload.requirements.get("quality_gates", {})
            )

        # Process the high-level task through Chief Architect
        workflow_id, subtasks = await architect.process_high_level_task(
            task_description=payload.task_description,
            task_type=task_type,
            project_context=project_context,
            priority=priority,
            requirements=payload.requirements
        )

        # Calculate total estimated duration
        total_duration = sum(task.estimated_duration_minutes for task in subtasks)

        # Prepare subtask summaries for response
        subtask_summaries = [
            {
                "id": task.id,
                "agent_type": task.agent_type.value,
                "task_type": task.task_type,
                "description": task.description,
                "priority": task.priority.value,
                "estimated_duration_minutes": task.estimated_duration_minutes,
                "dependencies": task.dependencies
            }
            for task in subtasks
        ]

        return WorkflowResponse(
            workflow_id=workflow_id,
            total_subtasks=len(subtasks),
            subtasks=subtask_summaries,
            estimated_duration_minutes=total_duration,
            status="created"
        )

        # Broadcast workflow creation to WebSocket clients
        asyncio.create_task(broadcast_workflow_update(
            workflow_id,
            "created",
            f"Workflow created with {len(subtasks)} subtasks"
        ))

    except Exception as e:
    asyncio.create_task(errorgold.publish_error(e, {
        "task_description": payload.task_description,
        "task_type": payload.task_type
    }))
    raise HTTPException(status_code=500, detail=f"Failed to orchestrate task: {str(e)}")

@app.post("/tasks", response_model=TaskResponse)
async def submit_legacy_task(payload: TaskRequest, background_tasks: BackgroundTasks):
    """
    Legacy endpoint for backward compatibility - simple echo response
    """

    # Basic validation
    if payload.priority < 1 or payload.priority > 10:
        raise HTTPException(status_code=422, detail="priority must be 1-10")

    task_id = str(uuid.uuid4())

    # Simple echo response for legacy compatibility
    result = {
        "echo": payload.parameters,
        "note": "Legacy endpoint - use /orchestrate for intelligent workflow creation"
    }

    try:
        if langgraph_app:
            state = {"parameters": payload.parameters}
            lg_out = langgraph_app.invoke(state)
            result.update(lg_out)
    except Exception as e:
        asyncio.create_task(errorgold.publish_error(e, {"task_type": payload.task_type}))
        raise

    return TaskResponse(
        id=task_id,
        received_at=datetime.utcnow(),
        result=result,
    )

@app.post("/workflows/{workflow_id}/execute")
async def execute_workflow(
    workflow_id: str,
    background_tasks: BackgroundTasks,
    architect: ChiefArchitectAgent = Depends(get_chief_architect)
):
    """Execute a created workflow"""

    try:
        # Execute workflow asynchronously
        background_tasks.add_task(execute_workflow_with_updates, workflow_id, architect)

        return {
            "workflow_id": workflow_id,
            "status": "execution_started",
            "message": "Workflow execution has been initiated in the background"
        }

    except Exception as e:
        asyncio.create_task(errorgold.publish_error(e, {"workflow_id": workflow_id}))
        raise HTTPException(status_code=500, detail=f"Failed to execute workflow: {str(e)}")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates"""
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            message_data = json.loads(data)

            if message_data.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
            elif message_data.get("type") == "subscribe_workflow":
                # Subscribe to specific workflow updates
                workflow_id = message_data.get("workflow_id")
                await websocket.send_text(json.dumps({
                    "type": "subscribed",
                    "workflow_id": workflow_id
                }))

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)

async def broadcast_workflow_update(workflow_id: str, status: str, message: str):
    """Broadcast workflow updates to all connected clients"""
    await manager.broadcast(json.dumps({
        "type": "workflow_update",
        "data": {
            "workflow_id": workflow_id,
            "status": status,
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        }
    }))

async def broadcast_agent_activity(agent_type: str, activity: str, details: Dict[str, Any] = None):
    """Broadcast agent activity to all connected clients"""
    await manager.broadcast(json.dumps({
        "type": "agent_activity",
        "data": {
            "agent_type": agent_type,
            "activity": activity,
            "details": details or {},
            "timestamp": datetime.utcnow().isoformat()
        }
    }))

@app.get("/workflows/{workflow_id}/status", response_model=WorkflowStatusResponse)
async def get_workflow_status(
    workflow_id: str,
    architect: ChiefArchitectAgent = Depends(get_chief_architect)
):
    """Get the current status of a workflow"""

    try:
        status = await architect.get_workflow_status(workflow_id)
        return WorkflowStatusResponse(**status)

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        asyncio.create_task(errorgold.publish_error(e, {"workflow_id": workflow_id}))
        raise HTTPException(status_code=500, detail=f"Failed to get workflow status: {str(e)}")


@app.get("/healthz")
async def healthcheck():
    """Enhanced health check including Chief Architect status"""
    global chief_architect

    health_status = {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "orchestrator": "healthy",
            "chief_architect": "healthy" if chief_architect else "unavailable",
            "redis": "unknown",
            "neo4j": "unknown",
            "qdrant": "unknown"
        }
    }

    # Test connectivity to core services if Chief Architect is available
    if chief_architect:
        try:
            # Quick Redis connectivity test
            chief_architect.redis_client.ping()
            health_status["services"]["redis"] = "healthy"
        except Exception:
            health_status["services"]["redis"] = "unhealthy"
            health_status["status"] = "degraded"

    return health_status

@app.get("/capabilities")
async def get_capabilities():
    """Describe orchestrator capabilities"""
    return {
        "agent_type": "chief_architect",
        "description": "Enterprise AI Operating Platform - Intelligent Task Orchestration",
        "capabilities": [
            "high_level_task_decomposition",
            "multi_agent_workflow_orchestration",
            "enterprise_context_awareness",
            "automated_quality_gates",
            "security_compliance_integration",
            "performance_optimization_workflows"
        ],
        "supported_task_types": [
            "feature_development",
            "bug_fix",
            "security_audit",
            "performance_optimization",
            "code_review",
            "refactoring",
            "documentation",
            "testing"
        ],
        "available_agents": [
            "codecraft",
            "securishield",
            "designforge",
            "perfpulse",
            "evaluator",
            "soc2_compliance"
        ]
    }

async def execute_workflow_with_updates(workflow_id: str, architect: ChiefArchitectAgent):
    """Execute workflow with WebSocket updates"""
    try:
        await broadcast_workflow_update(workflow_id, "started", "Workflow execution started")

        # Get workflow status before execution
        initial_status = await architect.get_workflow_status(workflow_id)

        # Execute workflow
        result = await architect.execute_workflow(workflow_id)

        # Broadcast completion
        await broadcast_workflow_update(
            workflow_id,
            "completed",
            f"Workflow completed: {result['completed_tasks']}/{result['total_tasks']} tasks successful"
        )

        return result

    except Exception as e:
        await broadcast_workflow_update(
            workflow_id,
            "failed",
            f"Workflow execution failed: {str(e)}"
        )
        raise e

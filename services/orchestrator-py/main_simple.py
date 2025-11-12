"""
Constella Chief Architect Orchestrator - Simplified Working Version
Coordinates specialized AI agents for comprehensive software development analysis
"""

import os
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import httpx

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Pydantic Models for Request Validation
class AnalysisRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=100000, description="Code to analyze")
    project_context: Optional[str] = Field(None, max_length=10000, description="Additional project context")
    analysis_type: str = Field("comprehensive", pattern=r"^(architecture|security|quality|comprehensive)$")
    priority: str = Field("normal", pattern=r"^(low|normal|high|urgent)$")

class AgentExecutionRequest(BaseModel):
    agent_name: str = Field(..., pattern=r"^[a-zA-Z0-9_-]+$", description="Name of the agent to execute")
    action: str = Field(..., min_length=1, max_length=100, description="Action to perform")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Parameters for the action")
    timeout_seconds: int = Field(30, ge=5, le=300, description="Execution timeout")

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

# Create FastAPI app
app = FastAPI(
    title="Constella Chief Architect Orchestrator",
    description="Coordinates specialized AI agents for software development analysis",
    version="2.1.0"
)

# CORS Configuration - Simple for now
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Simple Agent Registry - Mock agents that return structured responses
AGENT_REGISTRY = {
    "architecture": {
        "url": "http://localhost:8010",
        "capabilities": ["analyze_architecture", "suggest_patterns", "evaluate_design"],
        "timeout": 30,
        "available": False  # Will be set to True when agents are actually running
    },
    "security": {
        "url": "http://localhost:8011",
        "capabilities": ["scan_vulnerabilities", "check_compliance", "audit_permissions"],
        "timeout": 45,
        "available": False
    },
    "quality": {
        "url": "http://localhost:8012",
        "capabilities": ["check_quality", "suggest_improvements", "calculate_metrics"],
        "timeout": 30,
        "available": False
    }
}

# Memory storage - Simple in-memory for now
analysis_memory = {}

# Helper Functions
def generate_mock_analysis(analysis_type: str, code: str, context: Optional[str] = None) -> Dict[str, Any]:
    """Generate mock analysis results when real agents aren't available"""

    base_analysis = {
        "code_length": len(code),
        "lines_of_code": len(code.split('\n')),
        "analysis_timestamp": datetime.utcnow().isoformat(),
        "context_provided": context is not None
    }

    if analysis_type in ["architecture", "comprehensive"]:
        base_analysis["architecture"] = {
            "patterns_detected": ["MVC", "Dependency Injection"] if "class" in code.lower() else ["Functional"],
            "complexity_score": min(10, len(code) // 100 + 1),
            "maintainability": "Good" if len(code) < 1000 else "Moderate",
            "suggestions": [
                "Consider breaking down large functions",
                "Add more documentation",
                "Implement error handling"
            ]
        }

    if analysis_type in ["security", "comprehensive"]:
        base_analysis["security"] = {
            "vulnerabilities_found": 0 if "password" not in code.lower() else 1,
            "security_score": 8 if "password" not in code.lower() else 3,
            "issues": ["Potential hardcoded credentials"] if "password" in code.lower() else [],
            "recommendations": [
                "Use environment variables for secrets",
                "Implement input validation",
                "Add authentication layers"
            ]
        }

    if analysis_type in ["quality", "comprehensive"]:
        base_analysis["quality"] = {
            "quality_score": 7,
            "metrics": {
                "cyclomatic_complexity": min(10, code.count("if") + code.count("for") + 1),
                "code_duplication": "Low",
                "test_coverage": "Unknown"
            },
            "improvements": [
                "Add unit tests",
                "Improve variable naming",
                "Add type hints"
            ]
        }

    return base_analysis

async def execute_agent_action(agent_name: str, action: str, parameters: dict, timeout: int = 30) -> dict:
    """Execute an action on a specific agent with proper error handling"""
    if agent_name not in AGENT_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Agent {agent_name} not found")

    agent_config = AGENT_REGISTRY[agent_name]

    # For now, return mock data since agents aren't running
    # In the future, this will make actual HTTP calls to agent services
    if not agent_config["available"]:
        logger.warning(f"Agent {agent_name} not available, returning mock data")
        return {
            "status": "mock_response",
            "agent": agent_name,
            "action": action,
            "result": generate_mock_analysis(agent_name, parameters.get("code", ""), parameters.get("context"))
        }

    # Real agent call (for when agents are running)
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
        agents_available=len([a for a in AGENT_REGISTRY.values() if a["available"]]),
        uptime_seconds=0.0  # TODO: Track actual uptime
    )

@app.get("/agents")
async def list_agents():
    """List all available agents and their capabilities"""
    return {
        "agents": AGENT_REGISTRY,
        "total": len(AGENT_REGISTRY),
        "available": len([a for a in AGENT_REGISTRY.values() if a["available"]]),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_code(request: AnalysisRequest):
    """Perform comprehensive code analysis using multiple agents"""
    start_time = asyncio.get_event_loop().time()
    request_id = f"req_{int(start_time * 1000)}"

    logger.info(f"Starting analysis {request_id} for {len(request.code)} characters of code")

    try:
        results = {}
        agents_used = []

        # Store in memory for later retrieval
        analysis_memory[request_id] = {
            "request": request.dict(),
            "timestamp": datetime.utcnow().isoformat(),
            "status": "processing"
        }

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

        # Update memory
        analysis_memory[request_id].update({
            "results": results,
            "status": "completed",
            "execution_time_ms": execution_time_ms,
            "agents_used": agents_used
        })

        response = AnalysisResponse(
            request_id=request_id,
            status="completed",
            results=results,
            execution_time_ms=execution_time_ms,
            agents_used=agents_used,
            timestamp=datetime.utcnow().isoformat()
        )

        logger.info(f"Analysis {request_id} completed in {execution_time_ms}ms")
        return response

    except Exception as e:
        logger.error(f"Analysis {request_id} failed: {e}")
        end_time = asyncio.get_event_loop().time()
        execution_time_ms = int((end_time - start_time) * 1000)

        # Update memory with error
        if request_id in analysis_memory:
            analysis_memory[request_id].update({
                "status": "failed",
                "error": str(e),
                "execution_time_ms": execution_time_ms
            })

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
async def execute_agent(agent_name: str, request: AgentExecutionRequest):
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

@app.get("/memory/{request_id}")
async def get_analysis_memory(request_id: str):
    """Retrieve analysis results from memory"""
    if request_id not in analysis_memory:
        raise HTTPException(status_code=404, detail="Analysis not found")

    return analysis_memory[request_id]

@app.get("/memory")
async def list_analysis_memory():
    """List all analysis requests in memory"""
    return {
        "total_analyses": len(analysis_memory),
        "analyses": list(analysis_memory.keys()),
        "timestamp": datetime.utcnow().isoformat()
    }

# Development endpoints
@app.get("/dev/status")
async def dev_status():
    """Development status endpoint"""
    return {
        "environment": "development",
        "agents": AGENT_REGISTRY,
        "memory_entries": len(analysis_memory),
        "recent_analyses": list(analysis_memory.keys())[-5:] if analysis_memory else [],
        "timestamp": datetime.utcnow().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main_simple:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )

#!/usr/bin/env python3
"""
Minimal Test Version of Python Expert Agent
Simplified for testing core functionality without external dependencies
"""

import json
import time
from datetime import datetime
from typing import Dict, List, Any, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import uvicorn
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Minimal Models for Testing ---

class HealthResponse(BaseModel):
    status: str = "ok"
    agent_id: str = "python-expert-test"
    capabilities: List[str] = [
        "python_code_generation",
        "python_code_review",
        "python_best_practices"
    ]
    uptime_seconds: float = 0

class TaskParameters(BaseModel):
    prompt: Optional[str] = None
    code: Optional[str] = None
    python_version: Optional[str] = "3.9+"
    style_guide: Optional[str] = "pep8"
    include_tests: bool = False

class TestTask(BaseModel):
    task_id: str = Field(default="test-task-001")
    task_type: str
    parameters: TaskParameters

class TaskResult(BaseModel):
    task_id: str
    status: str = "completed"
    result: Dict[str, Any]
    confidence_score: float
    execution_time_ms: float
    test_mode: bool = True

# --- Minimal Python Expert for Testing ---

class TestPythonExpert:
    """Simplified Python Expert for testing basic functionality"""

    def __init__(self):
        self.start_time = time.time()
        self.test_knowledge = {
            "pep8": "Use 4 spaces for indentation, limit lines to 79 characters",
            "performance": "Use list comprehensions, prefer built-ins, profile first",
            "testing": "Use pytest, follow AAA pattern, mock dependencies"
        }

    def generate_test_code(self, task: TestTask) -> TaskResult:
        """Generate simple Python code for testing"""
        start_time = time.time()

        prompt = task.parameters.prompt or "test function"

        # Simple code generation based on prompt keywords
        if "fibonacci" in prompt.lower():
            code = """def fibonacci(n):
    \"\"\"Calculate fibonacci number using iteration\"\"\"
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b"""
        elif "factorial" in prompt.lower():
            code = """def factorial(n):
    \"\"\"Calculate factorial using recursion\"\"\"
    if n <= 1:
        return 1
    return n * factorial(n - 1)"""
        else:
            code = f"""def generated_function():
    \"\"\"Generated function for: {prompt}\"\"\"
    # TODO: Implement {prompt}
    pass"""

        if task.parameters.include_tests:
            code += "\n\n# Test cases\ndef test_generated_function():\n    assert generated_function() is not None"

        execution_time = (time.time() - start_time) * 1000

        return TaskResult(
            task_id=task.task_id,
            result={
                "generated_code": code,
                "language": "python",
                "style_guide": task.parameters.style_guide
            },
            confidence_score=0.85,
            execution_time_ms=execution_time
        )

    def review_test_code(self, task: TestTask) -> TaskResult:
        """Simple code review for testing"""
        start_time = time.time()

        if not task.parameters.code:
            raise HTTPException(status_code=400, detail="Code required for review")

        code = task.parameters.code
        insights = []
        warnings = []

        # Basic analysis
        if len(code.split('\n')) > 20:
            warnings.append("Function is quite long, consider breaking it down")

        if 'def ' in code and '"""' not in code and "'''" not in code:
            warnings.append("Missing docstring")

        if 'print(' in code:
            warnings.append("Consider using logging instead of print statements")

        if not warnings:
            insights.append("Code follows basic best practices")

        execution_time = (time.time() - start_time) * 1000

        return TaskResult(
            task_id=task.task_id,
            result={
                "review_summary": f"Analyzed {len(code.split())} words of Python code",
                "issues_found": len(warnings),
                "insights": insights,
                "warnings": warnings
            },
            confidence_score=0.75,
            execution_time_ms=execution_time
        )

# Initialize test agent
test_agent = TestPythonExpert()

# --- FastAPI Test App ---

app = FastAPI(
    title="Python Expert Agent - Test Mode",
    description="Minimal test version for functionality verification",
    version="1.0.0-test"
)

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Test health endpoint"""
    return HealthResponse(
        uptime_seconds=time.time() - test_agent.start_time
    )

@app.get("/capabilities")
async def get_test_capabilities():
    """Test capabilities endpoint"""
    return {
        "agent_id": "python-expert-test",
        "agent_type": "language_specialist_test",
        "test_mode": True,
        "supported_tasks": ["generate_code", "review_code"],
        "knowledge_base": list(test_agent.test_knowledge.keys())
    }

@app.post("/execute_task", response_model=TaskResult)
async def execute_test_task(task: TestTask):
    """Execute test tasks"""
    logger.info(f"Executing test task: {task.task_type}")

    try:
        if task.task_type == "generate_code":
            return test_agent.generate_test_code(task)
        elif task.task_type == "review_code":
            return test_agent.review_test_code(task)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported task: {task.task_type}")

    except Exception as e:
        logger.error(f"Task execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/test/ping")
async def test_ping():
    """Simple ping endpoint for connectivity testing"""
    return {
        "message": "pong",
        "timestamp": datetime.utcnow().isoformat(),
        "agent": "python-expert-test"
    }

if __name__ == "__main__":
    port = 8019  # Different port to avoid conflicts
    logger.info(f"Starting Python Expert Test Agent on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)

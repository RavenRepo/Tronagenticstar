#!/usr/bin/env python3
"""
CodeCraft Agent Micro-service
Specialized agent for code generation, refactoring, and optimization tasks.
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional
import logging
import time
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="CodeCraft Agent",
    description="Specialized agent for code generation, refactoring, and optimization",
    version="1.0.0"
)

# Request/Response Models
class CodeGenerationRequest(BaseModel):
    prompt: str
    language: str = "python"
    style: Optional[str] = "clean"
    max_lines: Optional[int] = 100

class CodeRefactorRequest(BaseModel):
    code: str
    language: str = "python"
    refactor_type: str = "optimize"  # optimize, modernize, clean
    preserve_functionality: bool = True

class CodeResponse(BaseModel):
    generated_code: str
    language: str
    confidence_score: float
    suggestions: List[str]
    execution_time_ms: float

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    version: str
    uptime_seconds: float

class MetricsResponse(BaseModel):
    total_requests: int
    generation_requests: int
    refactor_requests: int
    avg_response_time_ms: float
    success_rate: float

# Global metrics tracking
metrics = {
    "total_requests": 0,
    "generation_requests": 0,
    "refactor_requests": 0,
    "total_response_time": 0.0,
    "successful_requests": 0,
    "start_time": time.time()
}

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for CodeCraft service"""
    uptime = time.time() - metrics["start_time"]
    return HealthResponse(
        status="healthy",
        timestamp=time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        version="1.0.0",
        uptime_seconds=uptime
    )

@app.get("/metrics", response_model=MetricsResponse)
async def get_metrics():
    """Metrics endpoint for monitoring and observability"""
    avg_response_time = (
        metrics["total_response_time"] / max(metrics["total_requests"], 1)
    )
    success_rate = (
        metrics["successful_requests"] / max(metrics["total_requests"], 1) * 100
    )
    
    return MetricsResponse(
        total_requests=metrics["total_requests"],
        generation_requests=metrics["generation_requests"],
        refactor_requests=metrics["refactor_requests"],
        avg_response_time_ms=avg_response_time,
        success_rate=success_rate
    )

@app.post("/generate", response_model=CodeResponse)
async def generate_code(request: CodeGenerationRequest):
    """
    Generate code based on natural language prompt
    
    This endpoint accepts a code generation request and returns
    generated code with confidence metrics and suggestions.
    """
    start_time = time.time()
    
    try:
        metrics["total_requests"] += 1
        metrics["generation_requests"] += 1
        
        # Simulate code generation logic
        # In production, this would integrate with LLM APIs
        generated_code = f"""
# Generated {request.language} code for: {request.prompt}
def solution():
    # TODO: Implement {request.prompt}
    pass

if __name__ == "__main__":
    solution()
"""
        
        execution_time = (time.time() - start_time) * 1000
        metrics["total_response_time"] += execution_time
        metrics["successful_requests"] += 1
        
        logger.info(f"Generated code for prompt: {request.prompt[:50]}...")
        
        return CodeResponse(
            generated_code=generated_code.strip(),
            language=request.language,
            confidence_score=0.85,
            suggestions=[
                "Consider adding error handling",
                "Add type hints for better code quality",
                "Include unit tests for the generated function"
            ],
            execution_time_ms=execution_time
        )
        
    except Exception as e:
        logger.error(f"Code generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Code generation failed: {str(e)}")

@app.post("/refactor", response_model=CodeResponse)
async def refactor_code(request: CodeRefactorRequest):
    """
    Refactor existing code for optimization, modernization, or cleanup
    
    This endpoint accepts code and refactoring instructions,
    returning improved code with suggestions.
    """
    start_time = time.time()
    
    try:
        metrics["total_requests"] += 1
        metrics["refactor_requests"] += 1
        
        # Simulate code refactoring logic
        # In production, this would use AST parsing and LLM-based refactoring
        refactored_code = f"""
# Refactored {request.language} code ({request.refactor_type})
{request.code}

# Refactoring applied: {request.refactor_type}
# Functionality preserved: {request.preserve_functionality}
"""
        
        execution_time = (time.time() - start_time) * 1000
        metrics["total_response_time"] += execution_time
        metrics["successful_requests"] += 1
        
        logger.info(f"Refactored {request.language} code using {request.refactor_type}")
        
        return CodeResponse(
            generated_code=refactored_code.strip(),
            language=request.language,
            confidence_score=0.92,
            suggestions=[
                "Code complexity reduced",
                "Performance optimizations applied",
                "Code style improved according to best practices"
            ],
            execution_time_ms=execution_time
        )
        
    except Exception as e:
        logger.error(f"Code refactoring failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Code refactoring failed: {str(e)}")

@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": "CodeCraft Agent",
        "version": "1.0.0",
        "description": "Specialized agent for code generation, refactoring, and optimization",
        "endpoints": {
            "health": "/health",
            "metrics": "/metrics",
            "generate": "/generate",
            "refactor": "/refactor"
        }
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8012))
    uvicorn.run(app, host="0.0.0.0", port=port)

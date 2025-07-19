"""
PerfPulse - Performance Monitoring and Analysis Micro-service
Part of the AgentForge/Constella specialist agent ecosystem
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional
import time
import psutil
import asyncio

app = FastAPI(
    title="PerfPulse",
    description="Performance monitoring and analysis service for AgentForge",
    version="1.0.0"
)

# Request/Response Models
class PerformanceRequest(BaseModel):
    service_name: str
    metrics: Dict[str, float]
    duration_ms: Optional[float] = None

class OptimizationRequest(BaseModel):
    service_name: str
    code_snippet: Optional[str] = None
    performance_data: Dict[str, float]

class PerformanceResponse(BaseModel):
    service_name: str
    analysis: Dict[str, any]
    recommendations: List[str]
    score: float

class OptimizationResponse(BaseModel):
    service_name: str
    optimizations: List[str]
    expected_improvement: str
    priority: str

# Global metrics storage (in production, use Redis/DB)
performance_metrics = {}

@app.post("/analyze", response_model=PerformanceResponse)
async def analyze_performance(request: PerformanceRequest):
    """
    Analyze performance metrics and provide recommendations
    """
    try:
        # Store metrics
        if request.service_name not in performance_metrics:
            performance_metrics[request.service_name] = []
        
        performance_metrics[request.service_name].append({
            "timestamp": time.time(),
            "metrics": request.metrics,
            "duration_ms": request.duration_ms
        })
        
        # Analyze metrics
        analysis = {
            "cpu_usage": request.metrics.get("cpu_percent", 0),
            "memory_usage": request.metrics.get("memory_percent", 0),
            "response_time": request.duration_ms or 0,
            "status": "healthy"
        }
        
        # Generate recommendations based on thresholds
        recommendations = []
        score = 100.0
        
        if analysis["cpu_usage"] > 80:
            recommendations.append("High CPU usage detected. Consider optimizing compute-intensive operations.")
            score -= 20
            
        if analysis["memory_usage"] > 80:
            recommendations.append("High memory usage detected. Review memory leaks and optimize data structures.")
            score -= 20
            
        if analysis["response_time"] > 1000:
            recommendations.append("High response time detected. Consider caching and async optimizations.")
            score -= 15
            
        if not recommendations:
            recommendations.append("Performance metrics within acceptable ranges.")
            
        analysis["status"] = "critical" if score < 60 else "warning" if score < 80 else "healthy"
        
        return PerformanceResponse(
            service_name=request.service_name,
            analysis=analysis,
            recommendations=recommendations,
            score=max(0, score)
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Performance analysis failed: {str(e)}")

@app.post("/optimize", response_model=OptimizationResponse)
async def optimize_service(request: OptimizationRequest):
    """
    Provide optimization suggestions for a service
    """
    try:
        optimizations = []
        expected_improvement = "10-25%"
        priority = "medium"
        
        # Analyze performance data and suggest optimizations
        cpu_usage = request.performance_data.get("cpu_percent", 0)
        memory_usage = request.performance_data.get("memory_percent", 0)
        
        if cpu_usage > 70:
            optimizations.extend([
                "Implement async/await patterns for I/O operations",
                "Add connection pooling for database operations",
                "Consider implementing caching layers"
            ])
            priority = "high"
            expected_improvement = "20-40%"
            
        if memory_usage > 70:
            optimizations.extend([
                "Review and optimize data structures",
                "Implement proper garbage collection strategies",
                "Consider memory-efficient algorithms"
            ])
            
        if request.code_snippet:
            optimizations.append("Code-specific optimizations available (requires detailed analysis)")
            
        if not optimizations:
            optimizations.append("Service performance appears optimal")
            priority = "low"
            expected_improvement = "0-5%"
            
        return OptimizationResponse(
            service_name=request.service_name,
            optimizations=optimizations,
            expected_improvement=expected_improvement,
            priority=priority
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization analysis failed: {str(e)}")

@app.get("/health")
async def health_check():
    """
    Health check endpoint for load balancer
    """
    return {
        "status": "healthy",
        "service": "perfpulse",
        "version": "1.0.0",
        "timestamp": time.time()
    }

@app.get("/metrics")
async def get_metrics():
    """
    Prometheus-compatible metrics endpoint
    """
    try:
        # Get system metrics
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        
        # Count stored metrics
        total_services = len(performance_metrics)
        total_records = sum(len(records) for records in performance_metrics.values())
        
        return {
            "perfpulse_system_cpu_percent": cpu_percent,
            "perfpulse_system_memory_percent": memory.percent,
            "perfpulse_system_memory_total": memory.total,
            "perfpulse_system_memory_used": memory.used,
            "perfpulse_tracked_services_total": total_services,
            "perfpulse_performance_records_total": total_records,
            "perfpulse_uptime_seconds": time.time()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Metrics collection failed: {str(e)}")

@app.get("/")
async def root():
    """
    Root endpoint with service information
    """
    return {
        "service": "PerfPulse",
        "description": "Performance monitoring and analysis service",
        "version": "1.0.0",
        "endpoints": {
            "analyze": "POST /analyze - Analyze performance metrics",
            "optimize": "POST /optimize - Get optimization recommendations",
            "health": "GET /health - Health check",
            "metrics": "GET /metrics - Prometheus metrics"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8013)

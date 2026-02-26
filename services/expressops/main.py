#!/usr/bin/env python3
"""
ExpressOps Agent - Express.js/Node.js Backend Development Specialist
Specialized agent for Express.js API development, middleware creation, and Node.js backend optimization
"""

import json
import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request
from llm_provider import LLMProvider, LLMRequest, get_llm_provider
from pydantic import BaseModel


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


# --- Pydantic Models (ADR-012 Compliant) ---


class HealthResponse(BaseModel):
    status: str = "ok"
    details: Optional[str] = None
    llm_configured: bool = False
    llm_cost_usd: Optional[float] = None


class CapabilitiesResponse(BaseModel):
    agent_id: str = "expressops"
    agent_type: str = "framework_specialist"
    task_type: str = "EXPRESS_BACKEND"
    capabilities: List[str] = [
        "create_express_api",
        "generate_middleware",
        "optimize_routes",
        "implement_auth",
        "create_database_models",
        "setup_error_handling",
        "configure_cors",
        "implement_validation",
        "setup_logging",
        "performance_optimization",
    ]


class TaskParameters(BaseModel):
    project_name: str
    api_requirements: Optional[List[str]] = None
    database_type: Optional[str] = "postgresql"
    auth_method: Optional[str] = "jwt"
    cors_settings: Optional[Dict[str, Any]] = None
    middleware_requirements: Optional[List[str]] = None
    performance_targets: Optional[Dict[str, Any]] = None
    security_requirements: Optional[List[str]] = None


class Task(BaseModel):
    task_id: str
    task_type: str
    parameters: TaskParameters
    context: Optional[List[Dict[str, Any]]] = None


class TaskResultMetrics(BaseModel):
    processing_time_ms: float
    files_generated: int
    endpoints_created: int
    middleware_components: int


class TaskResult(BaseModel):
    task_id: str
    status: str = "completed"
    result: Dict[str, Any]
    metrics: TaskResultMetrics


# --- FastAPI App ---

AGENT_BEARER = os.getenv("AGENT_BEARER")


async def verify_orchestrator(request: Request):
    if not AGENT_BEARER:
        return True
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = auth.split(" ", 1)[1].strip()
    if token != AGENT_BEARER:
        raise HTTPException(status_code=403, detail="Invalid token")
    return True


app = FastAPI(
    title="ExpressOps Agent",
    description="Express.js/Node.js Backend Development Specialist",
    version="2.0.0",
)

# Global LLM provider instance
_llm: Optional[LLMProvider] = None


async def get_llm() -> LLMProvider:
    global _llm
    if _llm is None:
        _llm = await get_llm_provider()
    return _llm


@app.get("/llm-metrics")
async def llm_metrics(_: bool = Depends(verify_orchestrator)):
    """Return LLM usage metrics for monitoring."""
    try:
        llm = await get_llm()
        return {
            "status": "ok",
            "cost_today_usd": llm.get_cost_today(),
            "provider_health": {
                name: health.model_dump()
                for name, health in llm.get_provider_health().items()
            },
            "rate_limits": llm.get_rate_limit_status(),
        }
    except Exception as e:
        return {"error": str(e), "status": "llm_not_initialized"}


# --- Agent Logic ---


async def _create_express_api(params: TaskParameters) -> Dict[str, Any]:
    """Generate complete Express.js API structure with best practices"""

    llm = await get_llm()

    prompt = f"""
    Generate a complete Express.js API structure for project: {params.project_name}
    Requirements: {params.api_requirements}
    Database: {params.database_type}
    Auth: {params.auth_method}

    Return a JSON object with the following structure:
    {{
        "package.json": "content",
        "server.js": "content",
        "app.js": "content",
        "routes/": {{"index.js": "content"}},
        "middleware/": {{"auth.js": "content"}},
        "models/": {{"user.js": "content"}},
        "controllers/": {{"userController.js": "content"}},
        "config/": {{"db.js": "content"}},
        "utils/": {{"helpers.js": "content"}},
        ".env.example": "content",
        "README.md": "content"
    }}
    """

    response = await llm.complete(
        LLMRequest(
            system_prompt="You are an expert Node.js/Express.js backend developer.",
            user_prompt=prompt,
            temperature=0.2,
            require_json=True,
        )
    )

    try:
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        project_structure = json.loads(content)
    except Exception as e:
        logger.error(f"Failed to parse LLM response: {e}")
        project_structure = {"error": "Failed to parse LLM response"}

    return {
        "project_name": params.project_name,
        "structure": project_structure,
        "setup_instructions": _generate_setup_instructions(params),
        "best_practices": _get_express_best_practices(),
        "security_recommendations": _get_security_recommendations(),
        "performance_tips": _get_performance_recommendations(),
        "llm_provider": response.provider,
        "llm_model": response.model,
        "cost_usd": response.cost_usd,
    }


async def _generate_middleware(params: TaskParameters) -> Dict[str, Any]:
    """Create custom middleware components"""

    llm = await get_llm()

    prompt = f"""
    Create custom middleware components for project: {params.project_name}
    Auth Method: {params.auth_method}
    Requirements: {params.middleware_requirements}

    Return a JSON object with the following structure:
    {{
        "middleware_components": {{"auth.js": "content", "errorHandler.js": "content"}},
        "usage_examples": ["example 1"],
        "testing_strategies": ["strategy 1"]
    }}
    """

    response = await llm.complete(
        LLMRequest(
            system_prompt="You are an expert Node.js/Express.js backend developer.",
            user_prompt=prompt,
            temperature=0.2,
            require_json=True,
        )
    )

    try:
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        result = json.loads(content)
    except Exception as e:
        logger.error(f"Failed to parse LLM response: {e}")
        result = {"error": "Failed to parse LLM response"}

    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["cost_usd"] = response.cost_usd
    return result


async def _optimize_routes(params: TaskParameters) -> Dict[str, Any]:
    """Optimize Express.js routes for performance and maintainability"""

    llm = await get_llm()

    prompt = f"""
    Optimize Express.js routes for performance and maintainability for project: {params.project_name}
    Performance Targets: {params.performance_targets}

    Return a JSON object with the following structure:
    {{
        "optimizations": {{
            "route_organization": "description",
            "parameter_validation": "description",
            "caching_strategies": "description",
            "async_optimization": "description",
            "error_boundaries": "description"
        }},
        "performance_improvements": ["improvement 1"],
        "best_practices": ["practice 1"]
    }}
    """

    response = await llm.complete(
        LLMRequest(
            system_prompt="You are an expert Node.js/Express.js performance engineer.",
            user_prompt=prompt,
            temperature=0.2,
            require_json=True,
        )
    )

    try:
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        result = json.loads(content)
    except Exception as e:
        logger.error(f"Failed to parse LLM response: {e}")
        result = {"error": "Failed to parse LLM response"}

    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["cost_usd"] = response.cost_usd
    return result


def _generate_package_json(params: TaskParameters) -> str:
    """Generate package.json with appropriate dependencies"""

    dependencies = {
        "express": "^4.18.2",
        "cors": "^2.8.5",
        "helmet": "^7.0.0",
        "express-rate-limit": "^6.7.0",
        "compression": "^1.7.4",
        "dotenv": "^16.3.1",
    }

    dev_dependencies = {
        "nodemon": "^3.0.1",
        "jest": "^29.5.0",
        "supertest": "^6.3.3",
        "@types/node": "^20.4.0",
        "eslint": "^8.44.0",
    }

    # Add database dependencies
    if params.database_type == "postgresql":
        dependencies["pg"] = "^8.11.0"
        dependencies["sequelize"] = "^6.32.1"
    elif params.database_type == "mongodb":
        dependencies["mongoose"] = "^7.4.0"
    elif params.database_type == "redis":
        dependencies["redis"] = "^4.6.7"

    # Add authentication dependencies
    if params.auth_method == "jwt":
        dependencies["jsonwebtoken"] = "^9.0.1"
        dependencies["bcryptjs"] = "^2.4.3"
    elif params.auth_method == "passport":
        dependencies["passport"] = "^0.6.0"
        dependencies["passport-local"] = "^1.0.0"

    package_json = {
        "name": params.project_name.lower().replace(" ", "-"),
        "version": "1.0.0",
        "description": f"Express.js API for {params.project_name}",
        "main": "server.js",
        "scripts": {
            "start": "node server.js",
            "dev": "nodemon server.js",
            "test": "jest",
            "test:watch": "jest --watch",
            "lint": "eslint .",
            "lint:fix": "eslint . --fix",
        },
        "dependencies": dependencies,
        "devDependencies": dev_dependencies,
        "keywords": ["express", "api", "node.js", "backend"],
        "author": "Constella ExpressOps Agent",
        "license": "MIT",
        "engines": {"node": ">=18.0.0", "npm": ">=9.0.0"},
    }

    import json

    return json.dumps(package_json, indent=2)


def _generate_server_js(params: TaskParameters) -> str:
    """Generate main server.js file"""

    return f"""#!/usr/bin/env node
/**
 * {params.project_name} - Express.js Server
 * Generated by Constella ExpressOps Agent
 */

require('dotenv').config();
const app = require('./app');
const http = require('http');

const port = process.env.PORT || 3000;
const server = http.createServer(app);

server.listen(port, () => {{
  console.log(`🚀 {params.project_name} server running on port ${{port}}`);
  console.log(`📍 Environment: ${{process.env.NODE_ENV || 'development'}}`);
  console.log(`🔗 API URL: http://localhost:${{port}}/api`);
}});

// Graceful shutdown handling
process.on('SIGTERM', () => {{
  console.log('📴 SIGTERM received, shutting down gracefully');
  server.close(() => {{
    console.log('✅ Process terminated');
    process.exit(0);
  }});
}});

process.on('SIGINT', () => {{
  console.log('📴 SIGINT received, shutting down gracefully');
  server.close(() => {{
    console.log('✅ Process terminated');
    process.exit(0);
  }});
}});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {{
  console.error('❌ Unhandled Promise Rejection:', err);
  server.close(() => {{
    process.exit(1);
  }});
}});
"""


def _generate_app_js(params: TaskParameters) -> str:
    """Generate main app.js file with middleware setup"""

    cors_config = params.cors_settings or {
        "origin": "http://localhost:3000",
        "credentials": True,
    }

    return f"""/**
 * {params.project_name} - Express Application
 * Generated by Constella ExpressOps Agent
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const logger = require('./middleware/logger');
const auth = require('./middleware/auth');

// Import routes
const apiRoutes = require('./routes/api');
const healthRoutes = require('./routes/health');

const app = express();

// Security middleware
app.use(helmet({{
  contentSecurityPolicy: {{
    directives: {{
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    }},
  }},
}}));

// CORS configuration
app.use(cors({cors_config}));

// Rate limiting
const limiter = rateLimit({{
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {{
    error: 'Too many requests from this IP, please try again later.',
  }},
  standardHeaders: true,
  legacyHeaders: false,
}});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({{ limit: '10mb' }}));
app.use(express.urlencoded({{ extended: true, limit: '10mb' }}));

// Compression middleware
app.use(compression());

// Custom middleware
app.use(logger);

// Health check routes (before authentication)
app.use('/health', healthRoutes);

// API routes with authentication
app.use('/api', auth, apiRoutes);

// Root endpoint
app.get('/', (req, res) => {{
  res.json({{
    message: 'Welcome to {params.project_name} API',
    version: '1.0.0',
    status: 'operational',
    timestamp: new Date().toISOString(),
    endpoints: {{
      health: '/health',
      api: '/api',
      docs: '/api/docs'
    }}
  }});
}});

// 404 handler
app.use('*', (req, res) => {{
  res.status(404).json({{
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  }});
}});

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;
"""


def _generate_auth_middleware(auth_method: str) -> str:
    """Generate authentication middleware based on method"""

    if auth_method == "jwt":
        return """/**
 * JWT Authentication Middleware
 * Generated by Constella ExpressOps Agent
 */

const jwt = require('jsonwebtoken');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided',
        code: 'NO_TOKEN'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token verification failed',
        code: 'INVALID_TOKEN'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please refresh your token',
        code: 'TOKEN_EXPIRED'
      });
    }

    res.status(500).json({
      error: 'Authentication error',
      message: 'Internal authentication error'
    });
  }
};

module.exports = auth;
"""

    return """/**
 * Basic Authentication Middleware
 * Generated by Constella ExpressOps Agent
 */

const auth = async (req, res, next) => {
  // Skip authentication for health checks
  if (req.path.startsWith('/health')) {
    return next();
  }

  // Add your authentication logic here
  next();
};

module.exports = auth;
"""


def _generate_error_middleware() -> str:
    """Generate error handling middleware"""

    return """/**
 * Error Handling Middleware
 * Generated by Constella ExpressOps Agent
 */

const errorHandler = (err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: err.details || null,
      code: 'VALIDATION_ERROR'
    });
  }

  // Cast errors (e.g., invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid ID format',
      message: 'The provided ID is not valid',
      code: 'INVALID_ID'
    });
  }

  // Duplicate key errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      error: 'Duplicate field value',
      message: `${field} already exists`,
      code: 'DUPLICATE_FIELD'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token',
      message: 'Authentication failed',
      code: 'INVALID_TOKEN'
    });
  }

  // Default error
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err
    }),
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  });
};

module.exports = errorHandler;
"""


def _generate_setup_instructions(params: TaskParameters) -> List[str]:
    """Generate setup instructions for the project"""

    return [
        f"# {params.project_name} Setup Instructions",
        "",
        "## Prerequisites",
        "- Node.js >= 18.0.0",
        "- npm >= 9.0.0",
        f"- {params.database_type.title()} database (if using database)",
        "",
        "## Installation",
        "1. Clone the repository",
        "2. Install dependencies: `npm install`",
        "3. Copy environment file: `cp .env.example .env`",
        "4. Configure your environment variables in `.env`",
        "5. Set up your database connection",
        "",
        "## Running the Application",
        "- Development: `npm run dev`",
        "- Production: `npm start`",
        "- Testing: `npm test`",
        "",
        "## API Endpoints",
        "- Health Check: GET /health",
        "- API Base: /api/v1",
        "- Documentation: /api/docs",
        "",
        "## Environment Variables",
        "- PORT: Server port (default: 3000)",
        "- NODE_ENV: Environment (development/production)",
        "- JWT_SECRET: JWT signing secret",
        f"- DATABASE_URL: {params.database_type.title()} connection string",
    ]


def _get_express_best_practices() -> List[str]:
    """Get Express.js best practices"""

    return [
        "Use environment variables for configuration",
        "Implement proper error handling middleware",
        "Use compression middleware for better performance",
        "Implement rate limiting to prevent abuse",
        "Use helmet.js for security headers",
        "Validate input data using schemas",
        "Implement proper logging and monitoring",
        "Use CORS appropriately for cross-origin requests",
        "Structure routes logically in separate files",
        "Implement graceful shutdown handling",
        "Use async/await for better error handling",
        "Implement request/response caching where appropriate",
    ]


def _get_security_recommendations() -> List[str]:
    """Get security recommendations"""

    return [
        "Always validate and sanitize user input",
        "Use HTTPS in production",
        "Implement proper authentication and authorization",
        "Use secure HTTP headers (helmet.js)",
        "Implement rate limiting and request size limits",
        "Keep dependencies updated",
        "Use environment variables for sensitive data",
        "Implement CSRF protection for state-changing operations",
        "Log security events and monitor for suspicious activity",
        "Use secure session configuration",
        "Implement proper error messages (don't leak sensitive info)",
        "Regular security audits and penetration testing",
    ]


def _get_performance_recommendations() -> List[str]:
    """Get performance optimization recommendations"""

    return [
        "Use compression middleware",
        "Implement caching strategies (Redis, memory cache)",
        "Optimize database queries and use connection pooling",
        "Use async/await properly to avoid blocking",
        "Implement pagination for large data sets",
        "Use CDN for static assets",
        "Monitor and profile your application regularly",
        "Implement proper indexing in your database",
        "Use clustering for CPU-intensive operations",
        "Optimize JSON responses (avoid circular references)",
        "Implement request/response compression",
        "Use appropriate HTTP status codes and caching headers",
    ]


# Helper functions for other components
def _generate_routes(params: TaskParameters) -> Dict[str, str]:
    return {"api.js": "// API routes will be generated here"}


def _generate_models(params: TaskParameters) -> Dict[str, str]:
    return {"index.js": "// Database models will be generated here"}


def _generate_controllers(params: TaskParameters) -> Dict[str, str]:
    return {"index.js": "// Controllers will be generated here"}


def _generate_config_files(params: TaskParameters) -> Dict[str, str]:
    return {"database.js": "// Database configuration"}


def _generate_utilities(params: TaskParameters) -> Dict[str, str]:
    return {"helpers.js": "// Utility functions"}


def _generate_env_example(params: TaskParameters) -> str:
    return f"""# {params.project_name} Environment Variables
PORT=3000
NODE_ENV=development
JWT_SECRET=your-secret-key-here
DATABASE_URL=your-database-connection-string
"""


def _generate_readme(params: TaskParameters) -> str:
    return f"# {params.project_name}\n\nExpress.js API generated by Constella ExpressOps Agent"


def _generate_logging_middleware() -> str:
    return "// Logging middleware implementation"


def _generate_rate_limiter() -> str:
    return "// Rate limiting middleware implementation"


def _generate_custom_middleware(requirement: str) -> str:
    return f"// Custom {requirement} middleware implementation"


def _generate_middleware_usage_examples() -> Dict[str, str]:
    return {"examples": "Middleware usage examples"}


def _generate_middleware_tests() -> Dict[str, str]:
    return {"tests": "Middleware testing strategies"}


def _generate_route_organization_pattern() -> Dict[str, str]:
    return {"pattern": "Route organization recommendations"}


def _generate_validation_schemas() -> Dict[str, str]:
    return {"schemas": "Input validation schemas"}


def _generate_caching_patterns() -> Dict[str, str]:
    return {"patterns": "Caching implementation patterns"}


def _generate_async_patterns() -> Dict[str, str]:
    return {"patterns": "Async/await optimization patterns"}


def _generate_error_boundaries() -> Dict[str, str]:
    return {"boundaries": "Error boundary implementations"}


def _calculate_performance_gains() -> Dict[str, Any]:
    return {"estimated_improvement": "20-40% performance improvement"}


def _get_routing_best_practices() -> List[str]:
    return [
        "Use appropriate HTTP methods",
        "Implement proper status codes",
        "Use middleware efficiently",
    ]


# --- API Endpoints (ADR-012 Compliant) ---


@app.get("/health", response_model=HealthResponse)
async def health_check():
    try:
        llm = await get_llm()
        llm_ok = llm is not None and llm._initialized
        return HealthResponse(
            status="ok" if llm_ok else "degraded",
            details="LLM provider active" if llm_ok else "LLM provider not initialized",
            llm_configured=llm_ok,
            llm_cost_usd=llm.get_cost_today() if llm_ok else 0.0,
        )
    except Exception as e:
        return HealthResponse(
            status="degraded",
            details=f"LLM provider error: {str(e)}",
            llm_configured=False,
        )


@app.get("/capabilities", response_model=CapabilitiesResponse)
async def get_capabilities(_: bool = Depends(verify_orchestrator)):
    return CapabilitiesResponse()


@app.post("/execute_task", response_model=TaskResult)
async def execute_task(task: Task, _: bool = Depends(verify_orchestrator)):
    start_time = time.time()

    try:
        if task.task_type == "create_express_api":
            result_data = await _create_express_api(task.parameters)
        elif task.task_type == "generate_middleware":
            result_data = await _generate_middleware(task.parameters)
        elif task.task_type == "optimize_routes":
            result_data = await _optimize_routes(task.parameters)
        else:
            raise HTTPException(
                status_code=400, detail=f"Unsupported task type: {task.task_type}"
            )

        processing_time_ms = (time.time() - start_time) * 1000

        # Calculate metrics
        files_generated = len(result_data.get("structure", {}))
        endpoints_created = len(result_data.get("api_requirements", []))
        middleware_components = len(result_data.get("middleware_components", {}))

        return TaskResult(
            task_id=task.task_id,
            status="completed",
            result=result_data,
            metrics=TaskResultMetrics(
                processing_time_ms=processing_time_ms,
                files_generated=files_generated,
                endpoints_created=endpoints_created,
                middleware_components=middleware_components,
            ),
        )

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Task {task.task_id} failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"An unexpected error occurred: {str(e)}"
        )


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8015))  # Default port for expressops
    uvicorn.run(app, host="0.0.0.0", port=port)

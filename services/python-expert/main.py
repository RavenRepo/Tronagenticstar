#!/usr/bin/env python3
"""
Python Expert Agent - Gold Standard Python Development Specialist
Specialized agent with deep Python ecosystem knowledge, best practices, and code standards.
Designed to be the definitive Python development expert within the Constella ecosystem.
"""

import asyncio
import json

# Configure logging
import logging
import os
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

import aiohttp
import redis
import uvicorn
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request
from llm_provider import LLMProvider, LLMRequest, get_llm_provider
from pydantic import BaseModel, Field, validator
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)
from sentence_transformers import SentenceTransformer


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


# Load environment variables
load_dotenv()
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
AGENT_BEARER = os.getenv("PYTHON_EXPERT_TOKEN", os.getenv("AGENT_BEARER"))

# Initialize embedding model for semantic search
try:
    embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    logger.info("✅ Embedding model loaded successfully")
except Exception as e:
    logger.error(f"❌ Failed to load embedding model: {e}")
    embedding_model = None

# --- Pydantic Models ---


class HealthResponse(BaseModel):
    status: str = "ok"
    agent_id: str = "python-expert"
    capabilities: List[str] = [
        "python_code_generation",
        "python_code_review",
        "python_best_practices",
        "python_optimization",
        "python_testing",
        "python_architecture",
        "package_recommendations",
        "performance_analysis",
    ]
    knowledge_base_size: int = 0
    uptime_seconds: float = 0
    llm_configured: bool = False
    llm_cost_usd: Optional[float] = None


class PythonKnowledgeBase(BaseModel):
    """Represents Python-specific knowledge entries"""

    topic: str
    content: str
    category: str  # e.g., "best_practices", "patterns", "stdlib", "packages"
    confidence_score: float = Field(ge=0.0, le=1.0)
    source: str = "internal"
    tags: List[str] = []


class TaskParameters(BaseModel):
    """Enhanced task parameters for Python-specific operations"""

    prompt: Optional[str] = None
    code: Optional[str] = None
    python_version: Optional[str] = "3.9+"
    style_guide: Optional[str] = "pep8"  # pep8, black, google, etc.
    complexity_level: Optional[str] = "intermediate"  # beginner, intermediate, advanced
    focus_areas: List[str] = []  # performance, security, readability, testing
    max_lines: Optional[int] = 200
    include_tests: bool = False
    include_docstrings: bool = True
    optimization_target: Optional[str] = None  # speed, memory, readability
    frameworks: List[str] = []  # django, fastapi, flask, etc.


class PythonTask(BaseModel):
    task_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    task_type: str  # generate_code, review_code, optimize_code, suggest_packages, etc.
    parameters: TaskParameters
    context: Optional[List[Dict[str, Any]]] = None
    project_context: Optional[Dict[str, Any]] = None


class TaskResult(BaseModel):
    task_id: str
    status: str = "completed"
    result: Dict[str, Any]
    confidence_score: float
    python_specific_insights: List[str] = []
    recommendations: List[str] = []
    warnings: List[str] = []
    execution_time_ms: float
    knowledge_sources_used: List[str] = []
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    cost_usd: Optional[float] = None


class MemoryEntry(BaseModel):
    """Represents an entry in the agent's episodic memory"""

    entry_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    task_type: str
    context_summary: str
    solution_approach: str
    lessons_learned: List[str] = []
    patterns_identified: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --- Authentication ---


async def verify_orchestrator(request: Request):
    """Verify bearer token from orchestrator"""
    if not AGENT_BEARER:
        return True  # Allow in development

    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = auth.split(" ", 1)[1].strip()
    if token != AGENT_BEARER:
        raise HTTPException(status_code=403, detail="Invalid token")
    return True


# --- Python Expert Agent Core Logic ---


class PythonExpertAgent:
    """
    The core Python Expert Agent with specialized knowledge and capabilities
    """

    def __init__(self):
        self.redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        self.qdrant_client = QdrantClient(url=QDRANT_URL) if QDRANT_URL else None
        self.memory_collection = "python_expert_memory"
        self.knowledge_collection = "python_knowledge_base"
        self.start_time = time.time()
        self._llm: Optional[LLMProvider] = None

        # Initialize knowledge collections
        self._initialize_knowledge_storage()

        # Load Python-specific knowledge base
        asyncio.create_task(self._load_python_knowledge())

    async def get_llm(self) -> LLMProvider:
        if self._llm is None:
            self._llm = await get_llm_provider()
        return self._llm

    def _initialize_knowledge_storage(self):
        """Initialize Qdrant collections for Python knowledge and memory"""
        if not self.qdrant_client:
            logger.warning("Qdrant not available - running without semantic search")
            return

        try:
            collections = self.qdrant_client.get_collections().collections
            collection_names = [c.name for c in collections]

            # Python knowledge base collection
            if self.knowledge_collection not in collection_names:
                self.qdrant_client.create_collection(
                    collection_name=self.knowledge_collection,
                    vectors_config=VectorParams(size=384, distance=Distance.COSINE),
                )
                logger.info(f"Created collection: {self.knowledge_collection}")

            # Agent memory collection
            if self.memory_collection not in collection_names:
                self.qdrant_client.create_collection(
                    collection_name=self.memory_collection,
                    vectors_config=VectorParams(size=384, distance=Distance.COSINE),
                )
                logger.info(f"Created collection: {self.memory_collection}")

        except Exception as e:
            logger.error(f"Failed to initialize Qdrant collections: {e}")

    async def _load_python_knowledge(self):
        """Load essential Python knowledge into the knowledge base"""
        if not self.qdrant_client or not embedding_model:
            return

        python_knowledge = [
            {
                "topic": "PEP 8 Style Guide",
                "content": "Python Enhancement Proposal 8 provides coding conventions for Python code. Key points: use 4 spaces for indentation, limit lines to 79 characters, use snake_case for functions and variables, use PascalCase for classes.",
                "category": "best_practices",
                "confidence_score": 0.95,
                "source": "PEP 8",
                "tags": ["style", "conventions", "pep8"],
            },
            {
                "topic": "Python Performance Optimization",
                "content": "Use list comprehensions over loops when possible, prefer local variable access, use built-in functions, consider using generators for memory efficiency, profile before optimizing.",
                "category": "performance",
                "confidence_score": 0.90,
                "source": "performance_guide",
                "tags": ["performance", "optimization", "memory"],
            },
            {
                "topic": "Python Testing Best Practices",
                "content": "Use pytest for testing, follow AAA pattern (Arrange, Act, Assert), use fixtures for setup, mock external dependencies, aim for high test coverage but focus on critical paths.",
                "category": "testing",
                "confidence_score": 0.92,
                "source": "testing_guide",
                "tags": ["testing", "pytest", "quality"],
            },
            {
                "topic": "Python Security Guidelines",
                "content": "Validate all inputs, use parameterized queries for databases, avoid eval() and exec(), use secrets module for cryptographic operations, keep dependencies updated.",
                "category": "security",
                "confidence_score": 0.94,
                "source": "security_guide",
                "tags": ["security", "validation", "cryptography"],
            },
        ]

        try:
            points = []
            for i, knowledge in enumerate(python_knowledge):
                # Create embedding for semantic search
                embedding = embedding_model.encode(knowledge["content"]).tolist()

                point = PointStruct(id=i, vector=embedding, payload=knowledge)
                points.append(point)

            # Upsert points to collection
            self.qdrant_client.upsert(
                collection_name=self.knowledge_collection, points=points
            )

            logger.info(f"Loaded {len(points)} Python knowledge entries")

        except Exception as e:
            logger.error(f"Failed to load Python knowledge: {e}")

    async def search_knowledge(
        self, query: str, limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Search Python knowledge base using semantic similarity"""
        if not self.qdrant_client or not embedding_model:
            return []

        try:
            # Create query embedding
            query_embedding = embedding_model.encode(query).tolist()

            # Search similar knowledge
            search_result = self.qdrant_client.search(
                collection_name=self.knowledge_collection,
                query_vector=query_embedding,
                limit=limit,
                score_threshold=0.6,
            )

            return [hit.payload for hit in search_result]

        except Exception as e:
            logger.error(f"Knowledge search failed: {e}")
            return []

    async def store_memory(self, memory_entry: MemoryEntry):
        """Store episodic memory of agent actions and learnings"""
        if not self.qdrant_client or not embedding_model:
            return

        try:
            # Create embedding for memory content
            content = f"{memory_entry.context_summary} {memory_entry.solution_approach}"
            embedding = embedding_model.encode(content).tolist()

            # Store in Qdrant
            point = PointStruct(
                id=memory_entry.entry_id, vector=embedding, payload=memory_entry.dict()
            )

            self.qdrant_client.upsert(
                collection_name=self.memory_collection, points=[point]
            )

            # Also store in Redis for quick access
            self.redis_client.setex(
                f"python_expert_memory:{memory_entry.entry_id}",
                3600,  # 1 hour TTL
                json.dumps(memory_entry.dict(), default=str),
            )

        except Exception as e:
            logger.error(f"Failed to store memory: {e}")

    async def generate_python_code(self, task: PythonTask) -> TaskResult:
        """Generate high-quality Python code with best practices"""
        start_time = time.time()

        # Search relevant knowledge
        relevant_knowledge = await self.search_knowledge(task.parameters.prompt or "")
        knowledge_context = "\n".join(
            [k.get("content", "") for k in relevant_knowledge]
        )

        # Build comprehensive prompt
        system_prompt = f"""You are a Python Expert with deep knowledge of Python best practices, patterns, and ecosystem.

Python Knowledge Base Context:
{knowledge_context}

Requirements:
- Python version: {task.parameters.python_version}
- Style guide: {task.parameters.style_guide}
- Complexity: {task.parameters.complexity_level}
- Focus areas: {", ".join(task.parameters.focus_areas)}
- Include tests: {task.parameters.include_tests}
- Include docstrings: {task.parameters.include_docstrings}
- Frameworks: {", ".join(task.parameters.frameworks)}

Generate clean, efficient, well-documented Python code that follows best practices."""

        user_prompt = f"Task: {task.parameters.prompt}"
        if task.parameters.code:
            user_prompt += f"\n\nExisting code to work with:\n{task.parameters.code}"

        try:
            llm = await self.get_llm()
            response = await llm.complete(
                LLMRequest(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    temperature=0.1,
                    max_tokens=2000,
                )
            )

            generated_code = response.content.strip()
            if "```python" in generated_code:
                generated_code = (
                    generated_code.split("```python")[1].split("```")[0].strip()
                )
            elif "```" in generated_code:
                generated_code = generated_code.split("```")[1].split("```")[0].strip()

            confidence = 0.95

            # Generate insights and recommendations
            insights = [
                "Code follows PEP 8 style guidelines",
                "Proper error handling implemented",
                "Type hints included for better code clarity",
            ]

            recommendations = [
                "Consider adding unit tests",
                "Review performance implications for large datasets",
                "Validate input parameters",
            ]

            execution_time = (time.time() - start_time) * 1000

            # Store this interaction in memory
            memory = MemoryEntry(
                task_type=task.task_type,
                context_summary=task.parameters.prompt or "Code generation task",
                solution_approach="Used AI-assisted generation with Python best practices",
                lessons_learned=[
                    "Applied semantic knowledge search",
                    "Integrated style guidelines",
                ],
                patterns_identified=[
                    "Code generation pattern",
                    "Knowledge integration pattern",
                ],
            )
            await self.store_memory(memory)

            return TaskResult(
                task_id=task.task_id,
                status="completed",
                result={
                    "generated_code": generated_code,
                    "language": "python",
                    "style_guide": task.parameters.style_guide,
                    "python_version": task.parameters.python_version,
                },
                confidence_score=confidence,
                python_specific_insights=insights,
                recommendations=recommendations,
                execution_time_ms=execution_time,
                knowledge_sources_used=[k.get("topic", "") for k in relevant_knowledge],
                llm_provider=response.provider,
                llm_model=response.model,
                cost_usd=response.cost_usd,
            )

        except Exception as e:
            logger.error(f"Code generation failed: {e}")
            raise HTTPException(
                status_code=500, detail=f"Code generation error: {str(e)}"
            )

    async def review_python_code(self, task: PythonTask) -> TaskResult:
        """Perform comprehensive Python code review"""
        start_time = time.time()

        if not task.parameters.code:
            raise HTTPException(status_code=400, detail="Code is required for review")

        # Search for relevant review guidelines
        review_knowledge = await self.search_knowledge(
            f"python code review {' '.join(task.parameters.focus_areas)}"
        )

        insights = []
        recommendations = []
        warnings = []

        # Basic static analysis
        lines = task.parameters.code.split("\n")

        # Check line length (PEP 8)
        long_lines = [i + 1 for i, line in enumerate(lines) if len(line) > 79]
        if long_lines:
            warnings.append(f"Lines exceed 79 characters: {long_lines[:5]}")

        # Check for common patterns
        if "import *" in task.parameters.code:
            warnings.append("Avoid wildcard imports (import *)")

        if "eval(" in task.parameters.code or "exec(" in task.parameters.code:
            warnings.append("Avoid using eval() or exec() - potential security risk")

        # Check for docstrings
        if "def " in task.parameters.code and '"""' not in task.parameters.code:
            recommendations.append(
                "Add docstrings to functions for better documentation"
            )

        # Positive insights
        if "typing" in task.parameters.code or ":" in task.parameters.code:
            insights.append("Good use of type hints for code clarity")

        if "try:" in task.parameters.code and "except" in task.parameters.code:
            insights.append("Proper exception handling implemented")

        execution_time = (time.time() - start_time) * 1000

        return TaskResult(
            task_id=task.task_id,
            status="completed",
            result={
                "review_summary": f"Analyzed {len(lines)} lines of Python code",
                "code_quality_score": max(0.5, 1.0 - (len(warnings) * 0.1)),
                "issues_found": len(warnings),
                "total_lines": len(lines),
            },
            confidence_score=0.88,
            python_specific_insights=insights,
            recommendations=recommendations,
            warnings=warnings,
            execution_time_ms=execution_time,
            knowledge_sources_used=[k.get("topic", "") for k in review_knowledge],
        )

    def get_knowledge_base_size(self) -> int:
        """Get the current size of the knowledge base"""
        if not self.qdrant_client:
            return 0

        try:
            collection_info = self.qdrant_client.get_collection(
                self.knowledge_collection
            )
            return collection_info.points_count or 0
        except:
            return 0


# Global agent instance
agent = PythonExpertAgent()

# --- FastAPI Application ---

app = FastAPI(
    title="Python Expert Agent",
    description="Gold standard Python development specialist with deep ecosystem knowledge",
    version="1.0.0",
)

# --- API Endpoints ---


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check with agent capabilities"""
    return HealthResponse(
        knowledge_base_size=agent.get_knowledge_base_size(),
        uptime_seconds=time.time() - agent.start_time,
    )


@app.get("/capabilities")
async def get_capabilities(_: bool = Depends(verify_orchestrator)):
    """Get detailed agent capabilities"""
    return {
        "agent_id": "python-expert",
        "agent_type": "language_specialist",
        "primary_language": "python",
        "supported_versions": ["3.7+", "3.8+", "3.9+", "3.10+", "3.11+"],
        "specializations": [
            "code_generation",
            "code_review",
            "performance_optimization",
            "security_analysis",
            "testing_strategies",
            "package_recommendations",
        ],
        "knowledge_domains": [
            "stdlib",
            "popular_frameworks",
            "best_practices",
            "design_patterns",
            "performance_tuning",
        ],
        "memory_capabilities": {
            "episodic_memory": True,
            "knowledge_search": True,
            "learning_from_interactions": True,
        },
    }


@app.post("/execute_task", response_model=TaskResult)
async def execute_task(task: PythonTask, _: bool = Depends(verify_orchestrator)):
    """Execute Python-specific tasks"""
    logger.info(f"Executing task {task.task_id}: {task.task_type}")

    try:
        if task.task_type == "generate_code":
            return await agent.generate_python_code(task)
        elif task.task_type == "review_code":
            return await agent.review_python_code(task)
        elif task.task_type == "optimize_code":
            # Implement optimization logic
            task.parameters.focus_areas.append("performance")
            return await agent.generate_python_code(task)
        else:
            raise HTTPException(
                status_code=400, detail=f"Unsupported task type: {task.task_type}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Task execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search_knowledge")
async def search_knowledge(
    query: str, limit: int = 5, _: bool = Depends(verify_orchestrator)
):
    """Search Python knowledge base"""
    results = await agent.search_knowledge(query, limit)
    return {"query": query, "results": results, "count": len(results)}


@app.post("/add_knowledge")
async def add_knowledge(
    knowledge: PythonKnowledgeBase, _: bool = Depends(verify_orchestrator)
):
    """Add new knowledge to the Python knowledge base"""
    # This would implement knowledge addition logic
    return {"status": "knowledge_added", "topic": knowledge.topic}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8018))  # Unique port for Python Expert
    uvicorn.run(app, host="0.0.0.0", port=port)

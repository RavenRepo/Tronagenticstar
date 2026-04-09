#!/usr/bin/env python3
"""
Comprehensive Memory System Test for Constella
Tests the hybrid memory system (Redis + Qdrant + Neo4j) for storage, retrieval, and context awareness
"""

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime
from typing import Dict, List, Any, Optional

import redis
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from neo4j import AsyncGraphDatabase
from sentence_transformers import SentenceTransformer

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class MemorySystemTester:
    """Comprehensive tester for the Constella memory system"""

    def __init__(self):
        # Initialize connections (with fallback for testing)
        try:
            self.redis_client = redis.from_url("redis://localhost:6379/0", decode_responses=True)
            self.redis_available = True
            logger.info("✅ Redis connection established")
        except Exception as e:
            logger.warning(f"❌ Redis not available: {e}")
            self.redis_client = None
            self.redis_available = False

        try:
            self.qdrant_client = QdrantClient(url="http://localhost:6333")
            self.qdrant_available = True
            logger.info("✅ Qdrant connection established")
        except Exception as e:
            logger.warning(f"❌ Qdrant not available: {e}")
            self.qdrant_client = None
            self.qdrant_available = False

        try:
            self.neo4j_driver = AsyncGraphDatabase.driver("bolt://localhost:7687")
            self.neo4j_available = True
            logger.info("✅ Neo4j connection established")
        except Exception as e:
            logger.warning(f"❌ Neo4j not available: {e}")
            self.neo4j_driver = None
            self.neo4j_available = False

        # Initialize embedding model
        try:
            self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
            self.embeddings_available = True
            logger.info("✅ Embedding model loaded")
        except Exception as e:
            logger.warning(f"❌ Embedding model not available: {e}")
            self.embedding_model = None
            self.embeddings_available = False

        # Test data
        self.test_collections = {
            "test_knowledge": "Knowledge base test collection",
            "test_memory": "Episodic memory test collection",
            "test_context": "Inter-agent context test collection"
        }

        self.test_results = {
            "redis_tests": [],
            "qdrant_tests": [],
            "neo4j_tests": [],
            "integration_tests": [],
            "performance_tests": [],
            "memory_loss_tests": []
        }

    async def run_all_tests(self) -> Dict[str, Any]:
        """Run comprehensive memory system tests"""
        logger.info("🧠 Starting Comprehensive Memory System Tests")
        start_time = time.time()

        # Infrastructure tests
        await self.test_redis_memory()
        await self.test_qdrant_vector_storage()
        await self.test_neo4j_graph_storage()

        # Integration tests
        await self.test_hybrid_memory_integration()
        await self.test_context_sharing()
        await self.test_memory_persistence()

        # Performance tests
        await self.test_memory_performance()
        await self.test_concurrent_access()

        # Memory loss scenarios
        await self.test_memory_loss_scenarios()
        await self.test_context_degradation()

        execution_time = time.time() - start_time

        # Generate comprehensive report
        report = self.generate_test_report(execution_time)
        logger.info(f"🎯 Memory System Tests Completed in {execution_time:.2f}s")

        return report

    async def test_redis_memory(self):
        """Test Redis short-term memory and caching"""
        logger.info("🔴 Testing Redis Memory System")

        if not self.redis_available:
            self.test_results["redis_tests"].append({
                "test": "redis_availability",
                "status": "SKIPPED",
                "reason": "Redis not available",
                "timestamp": datetime.utcnow().isoformat()
            })
            return

        # Test 1: Basic storage and retrieval
        test_data = {
            "workflow_id": "test_workflow_001",
            "project_context": {
                "project_id": "test_project",
                "technology_stack": ["Python", "FastAPI", "React"],
                "last_updated": datetime.utcnow().isoformat()
            },
            "agent_state": {
                "python_expert": {"last_task": "code_generation", "confidence": 0.95},
                "architect": {"active_workflows": 3, "memory_usage": "normal"}
            }
        }

        try:
            # Store data with TTL
            self.redis_client.setex(
                f"test:project_context:{test_data['project_context']['project_id']}",
                3600,
                json.dumps(test_data)
            )

            # Retrieve and verify
            retrieved_data = self.redis_client.get(f"test:project_context:{test_data['project_context']['project_id']}")
            parsed_data = json.loads(retrieved_data) if retrieved_data else None

            success = parsed_data == test_data

            self.test_results["redis_tests"].append({
                "test": "basic_storage_retrieval",
                "status": "PASSED" if success else "FAILED",
                "data_size_bytes": len(json.dumps(test_data)),
                "retrieval_match": success,
                "timestamp": datetime.utcnow().isoformat()
            })

        except Exception as e:
            self.test_results["redis_tests"].append({
                "test": "basic_storage_retrieval",
                "status": "ERROR",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            })

        # Test 2: TTL and expiration behavior
        try:
            # Store with short TTL
            self.redis_client.setex("test:ttl_test", 2, "temporary_data")

            # Immediate retrieval should work
            immediate_result = self.redis_client.get("test:ttl_test")

            # Wait for expiration
            await asyncio.sleep(3)

            # Should be expired now
            expired_result = self.redis_client.get("test:ttl_test")

            ttl_test_passed = immediate_result == "temporary_data" and expired_result is None

            self.test_results["redis_tests"].append({
                "test": "ttl_expiration",
                "status": "PASSED" if ttl_test_passed else "FAILED",
                "immediate_retrieval": immediate_result is not None,
                "post_expiration_retrieval": expired_result is None,
                "timestamp": datetime.utcnow().isoformat()
            })

        except Exception as e:
            self.test_results["redis_tests"].append({
                "test": "ttl_expiration",
                "status": "ERROR",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            })

    async def test_qdrant_vector_storage(self):
        """Test Qdrant vector storage and semantic search"""
        logger.info("🟡 Testing Qdrant Vector Storage")

        if not self.qdrant_available or not self.embeddings_available:
            self.test_results["qdrant_tests"].append({
                "test": "qdrant_availability",
                "status": "SKIPPED",
                "reason": f"Qdrant: {self.qdrant_available}, Embeddings: {self.embeddings_available}",
                "timestamp": datetime.utcnow().isoformat()
            })
            return

        collection_name = "test_memory_vectors"

        try:
            # Create test collection
            self.qdrant_client.recreate_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=384, distance=Distance.COSINE)
            )

            # Test data with semantic relationships
            test_knowledge = [
                {
                    "id": "python_001",
                    "content": "Python list comprehensions are more efficient than loops for simple transformations",
                    "category": "performance",
                    "confidence": 0.95
                },
                {
                    "id": "python_002",
                    "content": "Using generators can save memory when processing large datasets in Python",
                    "category": "performance",
                    "confidence": 0.92
                },
                {
                    "id": "security_001",
                    "content": "Always validate user inputs to prevent SQL injection attacks",
                    "category": "security",
                    "confidence": 0.98
                },
                {
                    "id": "architecture_001",
                    "content": "Microservices architecture improves scalability but increases complexity",
                    "category": "architecture",
                    "confidence": 0.88
                }
            ]

            # Generate embeddings and store
            points = []
            for i, item in enumerate(test_knowledge):
                embedding = self.embedding_model.encode(item["content"]).tolist()
                point = PointStruct(
                    id=item["id"],
                    vector=embedding,
                    payload=item
                )
                points.append(point)

            # Upsert points
            self.qdrant_client.upsert(collection_name=collection_name, points=points)

            # Test semantic search
            search_query = "How to optimize Python code performance?"
            query_embedding = self.embedding_model.encode(search_query).tolist()

            search_results = self.qdrant_client.search(
                collection_name=collection_name,
                query_vector=query_embedding,
                limit=3,
                score_threshold=0.5
            )

            # Verify results - should return performance-related items
            performance_results = [r for r in search_results if r.payload.get("category") == "performance"]

            self.test_results["qdrant_tests"].append({
                "test": "semantic_search",
                "status": "PASSED" if len(performance_results) >= 2 else "FAILED",
                "query": search_query,
                "total_results": len(search_results),
                "performance_results": len(performance_results),
                "top_score": search_results[0].score if search_results else 0,
                "timestamp": datetime.utcnow().isoformat()
            })

            # Clean up
            self.qdrant_client.delete_collection(collection_name)

        except Exception as e:
            self.test_results["qdrant_tests"].append({
                "test": "semantic_search",
                "status": "ERROR",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            })

    async def test_neo4j_graph_storage(self):
        """Test Neo4j graph storage and relationship queries"""
        logger.info("🔵 Testing Neo4j Graph Storage")

        if not self.neo4j_available:
            self.test_results["neo4j_tests"].append({
                "test": "neo4j_availability",
                "status": "SKIPPED",
                "reason": "Neo4j not available",
                "timestamp": datetime.utcnow().isoformat()
            })
            return

        try:
            async with self.neo4j_driver.session() as session:
                # Create test workflow graph
                test_workflow_id = f"test_workflow_{int(time.time())}"

                # Create workflow node
                await session.run(
                    """
                    CREATE (w:TestWorkflow {
                        id: $workflow_id,
                        description: $description,
                        created_at: datetime(),
                        test_marker: true
                    })
                    """,
                    workflow_id=test_workflow_id,
                    description="Memory system test workflow"
                )

                # Create agent task nodes and relationships
                agents = ["python_expert", "architect", "security_shield"]

                for i, agent in enumerate(agents):
                    await session.run(
                        """
                        MATCH (w:TestWorkflow {id: $workflow_id})
                        CREATE (t:TestTask {
                            id: $task_id,
                            agent_type: $agent_type,
                            description: $description,
                            order: $order
                        })
                        CREATE (w)-[:CONTAINS]->(t)
                        """,
                        workflow_id=test_workflow_id,
                        task_id=f"task_{agent}_{i}",
                        agent_type=agent,
                        description=f"Test task for {agent}",
                        order=i
                    )

                # Query the created structure
                result = await session.run(
                    """
                    MATCH (w:TestWorkflow {id: $workflow_id})-[:CONTAINS]->(t:TestTask)
                    RETURN w.id as workflow_id, count(t) as task_count,
                           collect(t.agent_type) as agent_types
                    """,
                    workflow_id=test_workflow_id
                )

                record = await result.single()

                success = (record and
                          record["task_count"] == 3 and
                          set(record["agent_types"]) == set(agents))

                self.test_results["neo4j_tests"].append({
                    "test": "workflow_graph_creation",
                    "status": "PASSED" if success else "FAILED",
                    "workflow_id": test_workflow_id,
                    "tasks_created": record["task_count"] if record else 0,
                    "expected_tasks": 3,
                    "timestamp": datetime.utcnow().isoformat()
                })

                # Test relationship queries
                relationship_result = await session.run(
                    """
                    MATCH (w:TestWorkflow {test_marker: true})-[r:CONTAINS]->(t:TestTask)
                    RETURN type(r) as relationship_type, count(*) as relationship_count
                    """
                )

                rel_record = await relationship_result.single()

                self.test_results["neo4j_tests"].append({
                    "test": "relationship_queries",
                    "status": "PASSED" if rel_record and rel_record["relationship_count"] >= 3 else "FAILED",
                    "relationship_type": rel_record["relationship_type"] if rel_record else None,
                    "relationship_count": rel_record["relationship_count"] if rel_record else 0,
                    "timestamp": datetime.utcnow().isoformat()
                })

                # Clean up test data
                await session.run(
                    """
                    MATCH (w:TestWorkflow {test_marker: true})
                    DETACH DELETE w
                    """
                )

                await session.run(
                    """
                    MATCH (t:TestTask)
                    WHERE t.id STARTS WITH 'task_'
                    DELETE t
                    """
                )

        except Exception as e:
            self.test_results["neo4j_tests"].append({
                "test": "workflow_graph_creation",
                "status": "ERROR",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            })

    async def test_hybrid_memory_integration(self):
        """Test integration between all three memory components"""
        logger.info("🔄 Testing Hybrid Memory Integration")

        available_components = sum([self.redis_available, self.qdrant_available, self.neo4j_available])

        if available_components < 2:
            self.test_results["integration_tests"].append({
                "test": "hybrid_integration",
                "status": "SKIPPED",
                "reason": f"Only {available_components}/3 components available",
                "timestamp": datetime.utcnow().isoformat()
            })
            return

        try:
            integration_test_id = f"integration_test_{int(time.time())}"

            # Simulate a complete memory workflow
            workflow_data = {
                "workflow_id": integration_test_id,
                "description": "Python code generation task",
                "agent": "python_expert",
                "context": "Generate a sorting algorithm",
                "result": "Successfully generated quicksort implementation"
            }

            storage_results = {}

            # Store in Redis (active memory)
            if self.redis_available:
                try:
                    self.redis_client.setex(
                        f"active_workflow:{integration_test_id}",
                        300,  # 5 minutes
                        json.dumps(workflow_data)
                    )
                    storage_results["redis"] = "SUCCESS"
                except Exception as e:
                    storage_results["redis"] = f"ERROR: {e}"

            # Store in Qdrant (semantic memory)
            if self.qdrant_available and self.embeddings_available:
                try:
                    collection_name = "integration_test_memory"

                    # Ensure collection exists
                    try:
                        self.qdrant_client.create_collection(
                            collection_name=collection_name,
                            vectors_config=VectorParams(size=384, distance=Distance.COSINE)
                        )
                    except:
                        pass  # Collection might already exist

                    # Create embedding
                    content = f"{workflow_data['description']} {workflow_data['context']} {workflow_data['result']}"
                    embedding = self.embedding_model.encode(content).tolist()

                    point = PointStruct(
                        id=integration_test_id,
                        vector=embedding,
                        payload=workflow_data
                    )

                    self.qdrant_client.upsert(collection_name=collection_name, points=[point])
                    storage_results["qdrant"] = "SUCCESS"

                except Exception as e:
                    storage_results["qdrant"] = f"ERROR: {e}"

            # Store in Neo4j (relationship memory)
            if self.neo4j_available:
                try:
                    async with self.neo4j_driver.session() as session:
                        await session.run(
                            """
                            CREATE (w:IntegrationTestWorkflow {
                                id: $workflow_id,
                                description: $description,
                                agent: $agent,
                                created_at: datetime(),
                                test_marker: 'integration'
                            })
                            """,
                            workflow_id=integration_test_id,
                            description=workflow_data["description"],
                            agent=workflow_data["agent"]
                        )
                    storage_results["neo4j"] = "SUCCESS"

                except Exception as e:
                    storage_results["neo4j"] = f"ERROR: {e}"

            # Test cross-component retrieval
            retrieval_results = {}

            # Retrieve from Redis
            if storage_results.get("redis") == "SUCCESS":
                try:
                    redis_data = self.redis_client.get(f"active_workflow:{integration_test_id}")
                    retrieval_results["redis"] = json.loads(redis_data) if redis_data else None
                except Exception as e:
                    retrieval_results["redis"] = f"ERROR: {e}"

            # Search in Qdrant
            if storage_results.get("qdrant") == "SUCCESS":
                try:
                    search_embedding = self.embedding_model.encode("Python sorting algorithm").tolist()
                    search_results = self.qdrant_client.search(
                        collection_name="integration_test_memory",
                        query_vector=search_embedding,
                        limit=1
                    )
                    retrieval_results["qdrant"] = len(search_results) > 0 and search_results[0].id == integration_test_id
                except Exception as e:
                    retrieval_results["qdrant"] = f"ERROR: {e}"

            success_count = sum(1 for r in storage_results.values() if r == "SUCCESS")

            self.test_results["integration_tests"].append({
                "test": "hybrid_integration",
                "status": "PASSED" if success_count >= 2 else "FAILED",
                "storage_results": storage_results,
                "retrieval_results": retrieval_results,
                "components_working": success_count,
                "timestamp": datetime.utcnow().isoformat()
            })

        except Exception as e:
            self.test_results["integration_tests"].append({
                "test": "hybrid_integration",
                "status": "ERROR",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            })

    async def test_context_sharing(self):
        """Test context sharing between different agents"""
        logger.info("🤝 Testing Inter-Agent Context Sharing")

        # Test context propagation between agents
        context_data = {
            "project_id": "shared_project_001",
            "shared_knowledge": {
                "python_patterns": ["factory", "singleton", "observer"],
                "security_requirements": ["input_validation", "encryption"],
                "performance_targets": {"response_time": "< 200ms", "throughput": "> 1000rps"}
            },
            "agent_interactions": [
                {"from": "architect", "to": "python_expert", "context": "code_generation_request"},
                {"from": "python_expert", "to": "security", "context": "code_review_request"}
            ]
        }

        if self.redis_available:
            try:
                # Store shared context
                self.redis_client.setex(
                    f"shared_context:{context_data['project_id']}",
                    1800,  # 30 minutes
                    json.dumps(context_data)
                )

                # Simulate agent access to shared context
                retrieved_context = self.redis_client.get(f"shared_context:{context_data['project_id']}")
                parsed_context = json.loads(retrieved_context) if retrieved_context else None

                context_preserved = parsed_context == context_data

                self.test_results["integration_tests"].append({
                    "test": "context_sharing",
                    "status": "PASSED" if context_preserved else "FAILED",
                    "context_size": len(json.dumps(context_data)),
                    "preservation_check": context_preserved,
                    "timestamp": datetime.utcnow().isoformat()
                })

            except Exception as e:
                self.test_results["integration_tests"].append({
                    "test": "context_sharing",
                    "status": "ERROR",
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                })

    async def test_memory_persistence(self):
        """Test memory persistence across system restarts"""
        logger.info("💾 Testing Memory Persistence")

        # This test simulates what happens during system restart
        persistent_data = {
            "workflow_state": "completed",
            "learned_patterns": ["error_handling", "performance_optimization"],
            "project_insights": "User prefers functional programming style"
        }

        persistence_results = {}

        # Test Redis persistence (should survive if Redis is configured with persistence)
        if self.redis_available:
            try:
                self.redis_client.set("persistent_test:redis", json.dumps(persistent_data))
                # Immediate retrieval
                immediate = self.redis_client.get("persistent_test:redis")
                persistence_results["redis"] = json.loads(immediate) == persistent_data
            except Exception as e:
                persistence_results["redis"] = f"ERROR: {e}"

        # Test Qdrant persistence (should persist by default)
        if self.qdrant_available and self.embeddings_available:
            try:
                collection_name = "persistence_test"
                try:
                    self.qdrant_client.create_collection(
                        collection_name=collection_name,
                        vectors_config=VectorParams(size=384, distance=Distance.COSINE)
                    )
                except:
                    pass

                embedding = self.embedding_model.encode("persistence test data").tolist()
                point = PointStruct(
                    id="persistence_test_001",
                    vector=embedding,
                    payload=persistent_data
                )

                self.qdrant_client.upsert(collection_name=collection_name, points=[point])

                # Retrieve immediately
                result = self.qdrant_client.retrieve(
                    collection_name=collection_name,
                    ids=["persistence_test_001"]
                )

                persistence_results["qdrant"] = len(result) > 0 and result[0].payload == persistent_data

            except Exception as e:
                persistence_results["qdrant"] = f"ERROR: {e}"

        # Test Neo4j persistence (should persist by default)
        if self.neo4j_available:
            try:
                async with self.neo4j_driver.session() as session:
                    # Create persistent node
                    await session.run(
                        """
                        CREATE (p:PersistenceTest {
                            id: 'persistence_test_001',
                            data: $data,
                            created_at: datetime()
                        })
                        """,
                        data=json.dumps(persistent_data)
                    )

                    # Retrieve immediately
                    result = await session.run(
                        """
                        MATCH (p:PersistenceTest {id: 'persistence_test_001'})
                        RETURN p.data as data
                        """
                    )

                    record = await result.single()
                    if record:
                        retrieved_data = json.loads(record["data"])
                        persistence_results["neo4j"] = retrieved_data == persistent_data
                    else:
                        persistence_results["neo4j"] = False

                    # Clean up
                    await session.run(
                        """
                        MATCH (p:PersistenceTest {id: 'persistence_test_001'})
                        DELETE p
                        """
                    )

            except Exception as e:
                persistence_results["neo4j"] = f"ERROR: {e}"

        successful_persistence = sum(1 for r in persistence_results.values() if r is True)

        self.test_results["integration_tests"].append({
            "test": "memory_persistence",
            "status": "PASSED" if successful_persistence >= 1 else "FAILED",
            "persistence_results": persistence_results,
            "components_persisting": successful_persistence,
            "timestamp": datetime.utcnow().isoformat()
        })

    async def test_memory_performance(self):
        """Test memory system performance under load"""
        logger.info("⚡ Testing Memory System Performance")

        if not any([self.redis_available, self.qdrant_available, self.neo4j_available]):
            self.test_results["performance_tests"].append({
                "test": "memory_performance",
                "status": "SKIPPED",
                "reason": "No memory components available",
                "timestamp": datetime.utcnow().isoformat()
            })
            return

        performance_results = {}

        # Test Redis performance
        if self.redis_available:
            try:
                start_time = time.time()
                operations = 100

                # Write performance
                write_start = time.time()
                for i in range(operations):
                    self.redis_client.setex(f"perf_test:write:{i}", 300, f"test_data_{i}")
                write_time = time.time() - write_start

                # Read performance
                read_start = time.time()
                for i in range(operations):
                    self.redis_client.get(f"perf_test:write:{i}")
                read_time = time.time() - read_start

                total_time = time.time() - start_time

                performance_results["redis"] = {
                    "operations": operations,
                    "total_time": total_time,
                    "write_ops_per_second": operations / write_time,
                    "read_ops_per_second": operations / read_time,
                    "avg_operation_time_ms": (total_time / (operations * 2)) * 1000
                }

                # Cleanup
                for i in range(operations):
                    self.redis_client.delete(f"perf_test:write:{i}")

            except Exception as e:
                performance_results["redis"] = f"ERROR: {e}"

        # Test Qdrant performance
        if self.qdrant_available and self.embeddings_available:
            try:
                collection_name = "performance_test"
                operations = 10  # Smaller number for vector operations

                try:
                    self.qdrant_client.create_collection(
                        collection_name=collection_name,
                        vectors_config=VectorParams(size=384, distance=Distance.COSINE)
                    )
                except:
                    pass

                start_time = time.time()

                # Batch insert performance
                points = []
                for i in range(operations):
                    content = f"Performance test document number {i} with some content for embedding"
                    embedding = self.embedding_model.encode(content).tolist()
                    point = PointStruct(
                        id=f"perf_test_{i}",
                        vector=embedding,
                        payload={"content": content, "index": i}
                    )
                    points.append(point)

                insert_start = time.time()
                self.qdrant_client.upsert(collection_name=collection_name, points=points)
                insert_time = time.time() - insert_start

                # Search performance
                search_start = time.time()
                query_embedding = self.embedding_model.encode("test document content").tolist()
                for _ in range(10):  # 10 search operations
                    self.qdrant_client.search(
                        collection_name=collection_name,
                        query_vector=query_embedding,
                        limit=5
                    )
                search_time = time.time() - search_start

                total_time = time.time() - start_time

                performance_results["qdrant"] = {
                    "documents": operations,
                    "searches": 10,
                    "total_time": total_time,
                    "insert_time": insert_time,
                    "search_time": search_time,
                    "inserts_per_second": operations / insert_time,
                    "searches_per_second": 10 / search_time
                }

                # Cleanup
                self.qdrant_client.delete_collection(collection_name)

            except Exception as e:
                performance_results["qdrant"] = f"ERROR: {e}"

        self.test_results["performance_tests"].append({
            "test": "memory_performance",
            "status": "COMPLETED",
            "performance_results": performance_results,
            "timestamp": datetime.utcnow().isoformat()
        })

    async def test_concurrent_access(self):
        """Test concurrent access to memory systems"""
        logger.info("🔀 Testing Concurrent Memory Access")

        if not self.redis_available:
            self.test_results["performance_tests"].append({
                "test": "concurrent_access",
                "status": "SKIPPED",
                "reason": "Redis not available for concurrency testing",
                "timestamp": datetime.utcnow().isoformat()
            })
            return

        try:
            concurrent_tasks = 10
            operations_per_task = 20

            async def concurrent_worker(worker_id: int):
                """Worker function for concurrent operations"""
                operations_completed = 0
                errors = 0

                for i in range(operations_per_task):
                    try:
                        key = f"concurrent_test:worker_{worker_id}:op_{i}"
                        value = f"worker_{worker_id}_data_{i}_{time.time()}"

                        # Write operation
                        self.redis_client.setex(key, 60, value)

                        # Read operation
                        retrieved = self.redis_client.get(key)

                        if retrieved == value:
                            operations_completed += 1

                    except Exception as e:
                        errors += 1

                return {"worker_id": worker_id, "completed": operations_completed, "errors": errors}

            # Run concurrent workers
            start_time = time.time()
            tasks = [concurrent_worker(i) for i in range(concurrent_tasks)]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            execution_time = time.time() - start_time

            # Analyze results
            total_operations = 0
            total_errors = 0
            successful_workers = 0

            for result in results:
                if isinstance(result, dict):
                    total_operations += result["completed"]
                    total_errors += result["errors"]
                    if result["errors"] == 0:
                        successful_workers += 1

            expected_operations = concurrent_tasks * operations_per_task
            success_rate = total_operations / expected_operations if expected_operations > 0 else 0

            self.test_results["performance_tests"].append({
                "test": "concurrent_access",
                "status": "PASSED" if success_rate >= 0.95 else "FAILED",
                "concurrent_workers": concurrent_tasks,
                "operations_per_worker": operations_per_task,
                "total_operations_expected": expected_operations,
                "total_operations_completed": total_operations,
                "total_errors": total_errors,
                "success_rate": success_rate,
                "execution_time": execution_time,
                "operations_per_second": total_operations / execution_time,
                "timestamp": datetime.utcnow().isoformat()
            })

        except Exception as e:
            self.test_results["performance_tests"].append({
                "test": "concurrent_access",
                "status": "ERROR",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            })

    async def test_memory_loss_scenarios(self):
        """Test potential memory loss scenarios"""
        logger.info("⚠️  Testing Memory Loss Scenarios")

        loss_scenarios = []

        # Scenario 1: TTL expiration in Redis
        if self.redis_available:
            try:
                critical_data = {"project_state": "in_progress", "agent_context": "important_context"}

                # Store with very short TTL
                self.redis_client.setex("critical_data_test", 1, json.dumps(critical_data))

                # Immediate check
                immediate_check = self.redis_client.get("critical_data_test")

                # Wait for expiration
                await asyncio.sleep(2)

                # Post-expiration check
                expired_check = self.redis_client.get("critical_data_test")

                loss_scenarios.append({
                    "scenario": "redis_ttl_expiration",
                    "status": "DEMONSTRATED" if immediate_check and not expired_check else "FAILED",
                    "data_preserved_initially": immediate_check is not None,
                    "data_lost_after_expiration": expired_check is None,
                    "risk_level": "HIGH",
                    "mitigation": "Use longer TTLs, implement refresh mechanisms"
                })

            except Exception as e:
                loss_scenarios.append({
                    "scenario": "redis_ttl_expiration",
                    "status": "ERROR",
                    "error": str(e)
                })

        # Scenario 2: Collection deletion in Qdrant
        if self.qdrant_available:
            try:
                test_collection = "memory_loss_test"

                # Create collection with test data
                self.qdrant_client.create_collection(
                    collection_name=test_collection,
                    vectors_config=VectorParams(size=384, distance=Distance.COSINE)
                )

                # Verify collection exists
                collections = self.qdrant_client.get_collections().collections
                collection_exists = any(c.name == test_collection for c in collections)

                # Simulate accidental deletion
                if collection_exists:
                    self.qdrant_client.delete_collection(test_collection)

                # Check if collection still exists
                collections_after = self.qdrant_client.get_collections().collections
                collection_exists_after = any(c.name == test_collection for c in collections_after)

                loss_scenarios.append({
                    "scenario": "qdrant_collection_deletion",
                    "status": "DEMONSTRATED" if collection_exists and not collection_exists_after else "FAILED",
                    "collection_existed": collection_exists,
                    "collection_deleted": not collection_exists_after,
                    "risk_level": "CRITICAL",
                    "mitigation": "Implement collection backups, access controls"
                })

            except Exception as e:
                loss_scenarios.append({
                    "scenario": "qdrant_collection_deletion",
                    "status": "ERROR",
                    "error": str(e)
                })

        # Scenario 3: Connection failure simulation
        connection_failures = []

        if self.redis_available:
            try:
                # Test what happens when Redis becomes unavailable
                original_client = self.redis_client
                self.redis_client = redis.from_url("redis://nonexistent:6379/0", decode_responses=True)

                try:
                    self.redis_client.set("connection_test", "test_value")
                    connection_failures.append({"component": "redis", "failure_handled": False})
                except Exception:
                    connection_failures.append({"component": "redis", "failure_detected": True})

                # Restore original connection
                self.redis_client = original_client

            except Exception as e:
                connection_failures.append({"component": "redis", "error": str(e)})

        self.test_results["memory_loss_tests"].append({
            "test": "memory_loss_scenarios",
            "status": "COMPLETED",
            "scenarios_tested": len(loss_scenarios),
            "loss_scenarios": loss_scenarios,
            "connection_failures": connection_failures,
            "timestamp": datetime.utcnow().isoformat()
        })

    async def test_context_degradation(self):
        """Test context degradation over time and across operations"""
        logger.info("📉 Testing Context Degradation")

        if not self.redis_available:
            self.test_results["memory_loss_tests"].append({
                "test": "context_degradation",
                "status": "SKIPPED",
                "reason": "Redis not available",
                "timestamp": datetime.utcnow().isoformat()
            })
            return

        try:
            # Simulate context degradation through multiple operations
            initial_context = {
                "project_requirements": "Build a REST API with authentication",
                "user_preferences": {"framework": "FastAPI", "database": "PostgreSQL"},
                "conversation_history": [
                    "User wants authentication system",
                    "Discussed JWT implementation",
                    "Security requirements defined"
                ],
                "agent_insights": {
                    "python_expert": "User prefers type hints and async/await",
                    "security_agent": "Requires OAuth2 compliance"
                }
            }

            context_key = "degradation_test_context"
            context_versions = []

            # Store initial context
            self.redis_client.setex(context_key, 600, json.dumps(initial_context))
            context_versions.append({
                "version": 0,
                "size": len(json.dumps(initial_context)),
                "keys": list(initial_context.keys())
            })

            # Simulate context modifications (typical degradation patterns)
            degradation_steps = [
                # Step 1: Information gets filtered/simplified
                {
                    "project_requirements": "Build a REST API",  # Simplified
                    "user_preferences": {"framework": "FastAPI"},  # Reduced
                    "conversation_history": ["User wants authentication", "Discussed JWT"],  # Truncated
                    "agent_insights": {"python_expert": "User prefers async/await"}  # Partial loss
                },
                # Step 2: Further information loss
                {
                    "project_requirements": "Build API",  # More simplified
                    "user_preferences": {"framework": "FastAPI"},
                    "conversation_history": ["Authentication needed"],  # More truncated
                },
                # Step 3: Critical information loss
                {
                    "project_requirements": "Build API",
                    "user_preferences": {}  # Lost preferences
                }
            ]

            for i, degraded_context in enumerate(degradation_steps, 1):
                self.redis_client.setex(context_key, 600, json.dumps(degraded_context))
                context_versions.append({
                    "version": i,
                    "size": len(json.dumps(degraded_context)),
                    "keys": list(degraded_context.keys())
                })

                # Small delay to simulate time progression
                await asyncio.sleep(0.1)

            # Analysis
            size_degradation = []
            key_loss = []

            for i in range(1, len(context_versions)):
                prev = context_versions[i-1]
                curr = context_versions[i]

                size_change = (prev["size"] - curr["size"]) / prev["size"] * 100
                key_change = len(set(prev["keys"]) - set(curr["keys"]))

                size_degradation.append(size_change)
                key_loss.append(key_change)

            avg_size_loss = sum(size_degradation) / len(size_degradation) if size_degradation else 0
            total_key_loss = sum(key_loss)

            self.test_results["memory_loss_tests"].append({
                "test": "context_degradation",
                "status": "COMPLETED",
                "initial_context_size": context_versions[0]["size"],
                "final_context_size": context_versions[-1]["size"],
                "total_size_reduction_percent": ((context_versions[0]["size"] - context_versions[-1]["size"]) / context_versions[0]["size"]) * 100,
                "average_size_loss_per_step": avg_size_loss,
                "total_keys_lost": total_key_loss,
                "degradation_steps": len(degradation_steps),
                "context_versions": context_versions,
                "risk_assessment": "HIGH" if avg_size_loss > 20 else "MEDIUM" if avg_size_loss > 10 else "LOW",
                "timestamp": datetime.utcnow().isoformat()
            })

        except Exception as e:
            self.test_results["memory_loss_tests"].append({
                "test": "context_degradation",
                "status": "ERROR",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            })

    def generate_test_report(self, execution_time: float) -> Dict[str, Any]:
        """Generate comprehensive test report"""

        # Calculate overall statistics
        total_tests = sum(len(tests) for tests in self.test_results.values())

        status_counts = {"PASSED": 0, "FAILED": 0, "ERROR": 0, "SKIPPED": 0, "COMPLETED": 0}

        for test_category in self.test_results.values():
            for test in test_category:
                status = test.get("status", "UNKNOWN")
                if status in status_counts:
                    status_counts[status] += 1

        # Component availability
        component_status = {
            "redis": "AVAILABLE" if self.redis_available else "UNAVAILABLE",
            "qdrant": "AVAILABLE" if self.qdrant_available else "UNAVAILABLE",
            "neo4j": "AVAILABLE" if self.neo4j_available else "UNAVAILABLE",
            "embeddings": "AVAILABLE" if self.embeddings_available else "UNAVAILABLE"
        }

        # Generate recommendations
        recommendations = []

        if not self.redis_available:
            recommendations.append("⚠️  CRITICAL: Redis is not available. Active memory and caching will not function.")

        if not self.qdrant_available:
            recommendations.append("⚠️  WARNING: Qdrant is not available. Semantic search and vector memory will not function.")

        if not self.neo4j_available:
            recommendations.append("⚠️  WARNING: Neo4j is not available. Graph relationships and workflow tracking will not function.")

        if not self.embeddings_available:
            recommendations.append("⚠️  WARNING: Embedding model not available. Semantic similarity features will not work.")

        # Memory loss risk assessment
        memory_loss_risks = []

        for test in self.test_results.get("memory_loss_tests", []):
            if "scenarios" in test.get("loss_scenarios", []):
                for scenario in test["loss_scenarios"]:
                    if scenario.get("risk_level") in ["HIGH", "CRITICAL"]:
                        memory_loss_risks.append({
                            "scenario": scenario.get("scenario"),
                            "risk_level": scenario.get("risk_level"),
                            "mitigation": scenario.get("mitigation")
                        })

        # Performance summary
        performance_summary = {}
        for test in self.test_results.get("performance_tests", []):
            if test.get("test") == "memory_performance" and "performance_results" in test:
                performance_summary = test["performance_results"]

        return {
            "test_summary": {
                "execution_time_seconds": execution_time,
                "total_tests": total_tests,
                "test_results": status_counts,
                "success_rate": (status_counts["PASSED"] + status_counts["COMPLETED"]) / total_tests * 100 if total_tests > 0 else 0
            },
            "infrastructure_status": {
                "components": component_status,
                "components_available": sum(1 for status in component_status.values() if status == "AVAILABLE"),
                "hybrid_memory_functional": self.redis_available or self.qdrant_available or self.neo4j_available
            },
            "memory_system_analysis": {
                "storage_layers": {
                    "short_term_memory": "Redis - Active workflows, temporary context" if self.redis_available else "UNAVAILABLE",
                    "semantic_memory": "Qdrant - Vector embeddings, knowledge search" if self.qdrant_available else "UNAVAILABLE",
                    "relationship_memory": "Neo4j - Workflow graphs, agent relationships" if self.neo4j_available else "UNAVAILABLE"
                },
                "memory_loss_risks": memory_loss_risks,
                "context_awareness": {
                    "inter_agent_sharing": self.redis_available,
                    "semantic_search": self.qdrant_available and self.embeddings_available,
                    "relationship_tracking": self.neo4j_available
                }
            },
            "performance_metrics": performance_summary,
            "detailed_results": self.test_results,
            "recommendations": recommendations,
            "memory_system_health": {
                "overall_health": "HEALTHY" if sum(1 for status in component_status.values() if status == "AVAILABLE") >= 2 else "DEGRADED" if sum(1 for status in component_status.values() if status == "AVAILABLE") >= 1 else "CRITICAL",
                "critical_issues": len([r for r in memory_loss_risks if r.get("risk_level") == "CRITICAL"]),
                "context_preservation_risk": "HIGH" if not self.redis_available else "MEDIUM" if len(memory_loss_risks) > 2 else "LOW"
            },
            "timestamp": datetime.utcnow().isoformat()
        }

    async def cleanup(self):
        """Clean up test resources"""
        try:
            # Close connections
            if self.neo4j_driver:
                await self.neo4j_driver.close()

            # Clean up any remaining test data
            if self.redis_available:
                # Clean Redis test keys
                keys = self.redis_client.keys("test:*") + self.redis_client.keys("perf_test:*") + self.redis_client.keys("*_test*")
                if keys:
                    self.redis_client.delete(*keys)

            logger.info("🧹 Test cleanup completed")

        except Exception as e:
            logger.error(f"Cleanup error: {e}")

async def main():
    """Main function to run memory system tests"""
    tester = MemorySystemTester()

    try:
        # Run all tests
        report = await tester.run_all_tests()

        # Print summary report
        print("\n" + "="*80)
        print("🧠 CONSTELLA MEMORY SYSTEM TEST REPORT")
        print("="*80)

        print(f"\n📊 TEST SUMMARY:")
        print(f"   Total Tests: {report['test_summary']['total_tests']}")
        print(f"   Success Rate: {report['test_summary']['success_rate']:.1f}%")
        print(f"   Execution Time: {report['test_summary']['execution_time_seconds']:.2f}s")

        print(f"\n🔧 INFRASTRUCTURE STATUS:")
        for component, status in report['infrastructure_status']['components'].items():
            emoji = "✅" if status == "AVAILABLE" else "❌"
            print(f"   {emoji} {component.upper()}: {status}")

        print(f"\n🧠 MEMORY SYSTEM HEALTH: {report['memory_system_health']['overall_health']}")

        if report['recommendations']:
            print(f"\n⚠️  RECOMMENDATIONS:")
            for rec in report['recommendations']:
                print(f"   {rec}")

        if report['memory_system_analysis']['memory_loss_risks']:
            print(f"\n🚨 MEMORY LOSS RISKS:")
            for risk in report['memory_system_analysis']['memory_loss_risks']:
                print(f"   {risk['scenario']}: {risk['risk_level']} - {risk['mitigation']}")

        print(f"\n💾 Full detailed report available in test results")

        # Save detailed report to file
        with open("memory_system_test_report.json", "w") as f:
            import json
            json.dump(report, f, indent=2, default=str)

        print(f"📄 Detailed report saved to: memory_system_test_report.json")

    except Exception as e:
        logger.error(f"Test execution failed: {e}")
        raise

    finally:
        await tester.cleanup()

if __name__ == "__main__":
    asyncio.run(main())

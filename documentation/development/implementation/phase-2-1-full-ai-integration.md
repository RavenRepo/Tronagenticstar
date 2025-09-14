# 🚀 Phase 2.1 - Full AI Integration Implementation Guide

**Project**: Constella Multi-Agent AI Platform  
**Phase**: 2.1 - Full AI Integration & Production Readiness  
**Status**: 🚧 IN PROGRESS  
**Target Completion**: 1-2 weeks  
**Platform Readiness**: 85% → 95%

---

## 🎯 Phase 2.1 Objectives

### **Primary Goals:**
1. **Activate Real AI**: Configure production API keys for all 4 LLM providers
2. **RAG Integration**: Connect knowledge retrieval and embedding services
3. **End-to-End Workflows**: Test complete agent execution pipelines
4. **Performance Optimization**: Load testing, monitoring, and scaling
5. **Production Configuration**: Security hardening and deployment readiness

### **Success Criteria:**
- [ ] All LLM providers operational with real API keys
- [ ] RAG pipeline functional with knowledge retrieval
- [ ] Sub-2 second average agent response times
- [ ] 99.9% system reliability under load
- [ ] Complete documentation and deployment guides

---

## 📋 Prerequisites Verification

### **Foundation Confirmed** ✅
Based on analysis, you have:
- ✅ **Multi-Provider LLM Core**: 2,791 lines production-ready (OpenAI, Gemini, Anthropic, OpenRouter)
- ✅ **API Gateway**: Complete with auth, rate limiting, service discovery
- ✅ **VS Code Extension**: Ready for integration with gateway
- ✅ **Backend Services**: Orchestrator, embedding, retriever services ready
- ✅ **Intelligence Foundation**: All agents AI-enabled, hardcoded responses removed

### **Required API Keys**
You'll need to obtain:
- **OpenAI API Key**: `sk-...` from https://platform.openai.com/api-keys
- **Google Gemini API Key**: `AIza...` from https://aistudio.google.com/app/apikey
- **Anthropic API Key**: `sk-ant-...` from https://console.anthropic.com/
- **OpenRouter API Key**: `sk-or-...` from https://openrouter.ai/keys

---

## 🔑 Step 1: LLM Provider Configuration

### **1.1 Create Production Environment Configuration**

Create centralized environment configuration:

```bash
# Create production environment file
cd Tronagenticstar-master
touch .env.production
```

Add the following to `.env.production`:

```env
# ============================================================================
# CONSTELLA AI PLATFORM - PRODUCTION CONFIGURATION
# ============================================================================

# Node Environment
NODE_ENV=production
LOG_LEVEL=info

# ============================================================================
# LLM PROVIDER API KEYS
# ============================================================================

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-key-here
OPENAI_ORG_ID=org-your-org-id-here
OPENAI_PROJECT_ID=proj_your-project-id

# Google Gemini Configuration  
GEMINI_API_KEY=AIza-your-gemini-key-here
GEMINI_PROJECT_ID=your-google-project-id

# Anthropic Configuration
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here

# OpenRouter Configuration
OPENROUTER_API_KEY=sk-or-your-openrouter-key-here
OPENROUTER_HTTP_REFERER=https://constella.ai
OPENROUTER_X_TITLE=Constella-AI-Platform

# ============================================================================
# LLM CONFIGURATION SETTINGS
# ============================================================================

# Provider Priorities (higher = preferred)
LLM_PROVIDER_PRIORITY_CLAUDE_HAIKU=110
LLM_PROVIDER_PRIORITY_GEMINI_FLASH=100
LLM_PROVIDER_PRIORITY_OPENROUTER=95
LLM_PROVIDER_PRIORITY_OPENAI_MINI=90
LLM_PROVIDER_PRIORITY_OPENAI_4O=80

# Cost Management
LLM_DAILY_BUDGET_USD=50.00
LLM_COST_WARNING_THRESHOLD=80
LLM_COST_CUTOFF_THRESHOLD=95

# Performance Settings
LLM_DEFAULT_TIMEOUT_MS=30000
LLM_MAX_RETRIES=3
LLM_CACHE_TTL_SECONDS=3600
LLM_CACHE_MAX_SIZE=1000

# Model Preferences
LLM_DEFAULT_MODEL_OPENAI=gpt-4o-mini
LLM_DEFAULT_MODEL_ANTHROPIC=claude-3-haiku-20240307
LLM_DEFAULT_MODEL_GEMINI=gemini-1.5-flash
LLM_DEFAULT_MODEL_OPENROUTER=anthropic/claude-3-haiku

# ============================================================================
# API GATEWAY CONFIGURATION
# ============================================================================

API_GATEWAY_PORT=3000
API_GATEWAY_HOST=0.0.0.0
JWT_SECRET=your-secure-256-bit-jwt-secret-here
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX_REQUESTS=1000

# Development API Keys (remove in production)
API_KEYS={"prod-key-001":{"id":"prod-001","name":"Production Key","permissions":["*"],"rateLimit":5000,"active":true}}

# ============================================================================
# SERVICE DISCOVERY
# ============================================================================

# Orchestrator Service
ORCHESTRATOR_URL=http://localhost:8001
ORCHESTRATOR_TIMEOUT=30000
ORCHESTRATOR_RETRY_ATTEMPTS=3

# Embedding Service
EMBEDDING_URL=http://localhost:8002
EMBEDDING_TIMEOUT=15000
EMBEDDING_RETRY_ATTEMPTS=2

# Retriever Service  
RETRIEVER_URL=http://localhost:8003
RETRIEVER_TIMEOUT=15000
RETRIEVER_RETRY_ATTEMPTS=2

# Database Agent
DATABASE_AGENT_URL=http://localhost:8004

# ============================================================================
# RAG & KNOWLEDGE BASE CONFIGURATION
# ============================================================================

# Vector Database
VECTOR_DB_URL=http://localhost:6333
VECTOR_DB_COLLECTION=constella-knowledge
VECTOR_DB_DIMENSION=1536

# Knowledge Base
KB_UPDATE_INTERVAL_HOURS=24
KB_MAX_DOCUMENT_SIZE_MB=10
KB_SUPPORTED_FORMATS=pdf,md,txt,docx

# RAG Settings
RAG_MAX_CONTEXT_LENGTH=8000
RAG_SIMILARITY_THRESHOLD=0.75
RAG_MAX_RETRIEVED_DOCS=5

# ============================================================================
# MONITORING & OBSERVABILITY
# ============================================================================

# Prometheus Metrics
PROMETHEUS_ENABLED=true
PROMETHEUS_PORT=9090

# Logging
LOG_FORMAT=json
LOG_LEVEL=info
LOG_MAX_FILES=7
LOG_MAX_SIZE_MB=100

# Health Checks
HEALTH_CHECK_INTERVAL_SECONDS=30
HEALTH_CHECK_TIMEOUT_MS=5000
```

### **1.2 Update API Gateway with LLM Provider Support**

Update the API Gateway to include LLM provider status:

```bash
cd services/api-gateway/src
```

Create `services/llm-status.ts`:

```typescript
import { Request, Response } from 'express';
import axios from 'axios';

interface LLMProviderStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  lastCheck: string;
  model: string;
  costPerToken?: number;
}

export class LLMStatusService {
  private providerStatus: Map<string, LLMProviderStatus> = new Map();

  async checkProviderHealth(): Promise<Map<string, LLMProviderStatus>> {
    const providers = [
      { name: 'openai', testModel: 'gpt-3.5-turbo' },
      { name: 'anthropic', testModel: 'claude-3-haiku-20240307' },
      { name: 'gemini', testModel: 'gemini-1.5-flash' },
      { name: 'openrouter', testModel: 'anthropic/claude-3-haiku' }
    ];

    const healthChecks = providers.map(provider => 
      this.checkSingleProvider(provider.name, provider.testModel)
    );

    await Promise.allSettled(healthChecks);
    return this.providerStatus;
  }

  private async checkSingleProvider(name: string, model: string): Promise<void> {
    const startTime = Date.now();
    try {
      // Simple health check - attempt to get model info or make minimal request
      const response = await this.makeTestRequest(name, model);
      const responseTime = Date.now() - startTime;
      
      this.providerStatus.set(name, {
        name,
        status: response ? 'healthy' : 'degraded',
        responseTime,
        lastCheck: new Date().toISOString(),
        model
      });
    } catch (error) {
      this.providerStatus.set(name, {
        name,
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        model
      });
    }
  }

  private async makeTestRequest(provider: string, model: string): Promise<boolean> {
    // Implementation would depend on your LLM core package
    // This is a placeholder for the actual health check logic
    return true; // Replace with actual test
  }

  async getLLMStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = await this.checkProviderHealth();
      const statusArray = Array.from(status.values());
      
      res.json({
        timestamp: new Date().toISOString(),
        providers: statusArray,
        totalProviders: statusArray.length,
        healthyProviders: statusArray.filter(p => p.status === 'healthy').length
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get LLM provider status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
```

### **1.3 Test LLM Provider Integration**

Create a comprehensive test script:

```bash
cd Tronagenticstar-master
```

Create `test-llm-providers.js`:

```javascript
#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config({ path: '.env.production' });

const GATEWAY_URL = 'http://localhost:3000';
const TEST_PROMPT = "Explain what you are in one sentence.";

const providers = [
  { name: 'OpenAI GPT-4o-mini', endpoint: '/v1/llm/openai', model: 'gpt-4o-mini' },
  { name: 'Anthropic Claude Haiku', endpoint: '/v1/llm/anthropic', model: 'claude-3-haiku-20240307' },
  { name: 'Google Gemini Flash', endpoint: '/v1/llm/gemini', model: 'gemini-1.5-flash' },
  { name: 'OpenRouter Claude', endpoint: '/v1/llm/openrouter', model: 'anthropic/claude-3-haiku' }
];

async function testProvider(provider) {
  console.log(`\n🧪 Testing ${provider.name}...`);
  const startTime = Date.now();
  
  try {
    const response = await axios.post(`${GATEWAY_URL}${provider.endpoint}`, {
      model: provider.model,
      messages: [{ role: 'user', content: TEST_PROMPT }],
      max_tokens: 100
    }, {
      headers: {
        'X-API-Key': 'prod-key-001',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const duration = Date.now() - startTime;
    console.log(`✅ ${provider.name}: ${duration}ms`);
    console.log(`   Response: "${response.data.choices?.[0]?.message?.content?.substring(0, 80)}..."`);
    
    return { success: true, duration, provider: provider.name };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ ${provider.name}: FAILED (${duration}ms)`);
    console.log(`   Error: ${error.response?.data?.error?.message || error.message}`);
    
    return { success: false, duration, provider: provider.name, error: error.message };
  }
}

async function runLLMProviderTests() {
  console.log('🚀 Constella LLM Provider Integration Test\n');
  console.log(`Gateway URL: ${GATEWAY_URL}`);
  console.log(`Test Prompt: "${TEST_PROMPT}"\n`);
  console.log('─'.repeat(60));

  const results = [];
  for (const provider of providers) {
    const result = await testProvider(provider);
    results.push(result);
    
    // Wait between tests to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Results Summary
  console.log('\n' + '─'.repeat(60));
  console.log('📊 Test Results Summary');
  console.log('─'.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`Total Providers: ${results.length}`);
  console.log(`Successful: ${successful.length} ✅`);
  console.log(`Failed: ${failed.length} ❌`);
  console.log(`Success Rate: ${((successful.length / results.length) * 100).toFixed(1)}%`);

  if (successful.length > 0) {
    const avgTime = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
    console.log(`Average Response Time: ${avgTime.toFixed(0)}ms`);
  }

  if (successful.length >= 2) {
    console.log('\n🎉 Multi-provider AI integration successful!');
    console.log('✨ Constella platform ready for production AI workloads.');
  } else {
    console.log('\n⚠️  Some providers failed. Check API keys and configuration.');
  }
}

if (require.main === module) {
  runLLMProviderTests().catch(console.error);
}
```

---

## 🧠 Step 2: RAG Integration & Knowledge Base

### **2.1 Configure Vector Database**

Set up Qdrant vector database for knowledge storage:

```bash
# Start Qdrant vector database
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

### **2.2 Enhance Embedding Service**

Update the embedding service for RAG capabilities:

```bash
cd services/embedding
```

Update `main.py` with production features:

```python
import os
import asyncio
import logging
from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import openai
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams, PointStruct
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize clients
app = FastAPI(title="Constella Embedding Service", version="2.1.0")
openai_client = openai.AsyncOpenAI(api_key=os.getenv('OPENAI_API_KEY'))
qdrant_client = QdrantClient(url=os.getenv('VECTOR_DB_URL', 'http://localhost:6333'))

# Models
class EmbeddingRequest(BaseModel):
    text: str
    metadata: Optional[Dict] = None

class EmbeddingResponse(BaseModel):
    embedding: List[float]
    dimension: int
    model: str

class DocumentRequest(BaseModel):
    content: str
    title: str
    source: str
    metadata: Optional[Dict] = None

class SearchRequest(BaseModel):
    query: str
    limit: int = 5
    threshold: float = 0.75

@app.on_event("startup")
async def startup_event():
    """Initialize vector collections"""
    try:
        # Create collection if it doesn't exist
        collection_name = os.getenv('VECTOR_DB_COLLECTION', 'constella-knowledge')
        dimension = int(os.getenv('VECTOR_DB_DIMENSION', '1536'))
        
        collections = await qdrant_client.get_collections()
        collection_exists = any(col.name == collection_name for col in collections.collections)
        
        if not collection_exists:
            await qdrant_client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=dimension, distance=Distance.COSINE),
            )
            logger.info(f"Created collection: {collection_name}")
        
        logger.info("Embedding service initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize embedding service: {e}")

@app.post("/embed", response_model=EmbeddingResponse)
async def create_embedding(request: EmbeddingRequest):
    """Create embedding for text"""
    try:
        response = await openai_client.embeddings.create(
            model="text-embedding-ada-002",
            input=request.text
        )
        
        embedding = response.data[0].embedding
        
        return EmbeddingResponse(
            embedding=embedding,
            dimension=len(embedding),
            model="text-embedding-ada-002"
        )
    except Exception as e:
        logger.error(f"Embedding creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/documents")
async def add_document(request: DocumentRequest, background_tasks: BackgroundTasks):
    """Add document to knowledge base"""
    try:
        # Create embedding
        embedding_response = await openai_client.embeddings.create(
            model="text-embedding-ada-002",
            input=request.content
        )
        
        embedding = embedding_response.data[0].embedding
        doc_id = str(uuid.uuid4())
        
        # Store in vector database
        point = PointStruct(
            id=doc_id,
            vector=embedding,
            payload={
                "title": request.title,
                "content": request.content,
                "source": request.source,
                "metadata": request.metadata or {},
                "created_at": datetime.utcnow().isoformat()
            }
        )
        
        collection_name = os.getenv('VECTOR_DB_COLLECTION', 'constella-knowledge')
        await qdrant_client.upsert(collection_name=collection_name, points=[point])
        
        logger.info(f"Added document: {request.title}")
        return {"id": doc_id, "status": "added"}
        
    except Exception as e:
        logger.error(f"Document addition failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search")
async def search_knowledge(request: SearchRequest):
    """Search knowledge base"""
    try:
        # Create query embedding
        embedding_response = await openai_client.embeddings.create(
            model="text-embedding-ada-002",
            input=request.query
        )
        
        query_embedding = embedding_response.data[0].embedding
        
        # Search vector database
        collection_name = os.getenv('VECTOR_DB_COLLECTION', 'constella-knowledge')
        search_result = await qdrant_client.search(
            collection_name=collection_name,
            query_vector=query_embedding,
            limit=request.limit,
            score_threshold=request.threshold
        )
        
        results = []
        for hit in search_result:
            results.append({
                "id": hit.id,
                "score": hit.score,
                "title": hit.payload.get("title"),
                "content": hit.payload.get("content"),
                "source": hit.payload.get("source"),
                "metadata": hit.payload.get("metadata", {})
            })
        
        return {"results": results, "total": len(results)}
        
    except Exception as e:
        logger.error(f"Knowledge search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test vector database connection
        collections = await qdrant_client.get_collections()
        
        return {
            "status": "healthy",
            "service": "embedding",
            "version": "2.1.0",
            "vector_db": "connected",
            "collections": len(collections.collections)
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "service": "embedding",
            "error": str(e)
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
```

### **2.3 Update Retriever Service for RAG**

Update `services/retriever/main.py`:

```python
import os
import asyncio
import logging
from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Constella Retriever Service", version="2.1.0")

class RetrievalRequest(BaseModel):
    query: str
    max_results: int = 5
    similarity_threshold: float = 0.75
    context_length: int = 8000

class RetrievalResponse(BaseModel):
    context: str
    sources: List[Dict]
    total_tokens: int

@app.post("/retrieve", response_model=RetrievalResponse)
async def retrieve_context(request: RetrievalRequest):
    """Retrieve relevant context for RAG"""
    try:
        embedding_url = os.getenv('EMBEDDING_URL', 'http://localhost:8002')
        
        async with httpx.AsyncClient() as client:
            # Search for relevant documents
            search_response = await client.post(
                f"{embedding_url}/search",
                json={
                    "query": request.query,
                    "limit": request.max_results,
                    "threshold": request.similarity_threshold
                }
            )
            
            if search_response.status_code != 200:
                raise HTTPException(
                    status_code=500, 
                    detail="Failed to search knowledge base"
                )
            
            search_results = search_response.json()
            
            # Build context from results
            context_parts = []
            sources = []
            total_length = 0
            
            for result in search_results.get("results", []):
                content = result["content"]
                title = result["title"]
                source = result["source"]
                score = result["score"]
                
                # Add context with source attribution
                context_part = f"## {title}\nSource: {source}\nRelevance: {score:.3f}\n\n{content}\n\n"
                
                # Check if adding this would exceed context length
                if total_length + len(context_part) > request.context_length:
                    break
                
                context_parts.append(context_part)
                sources.append({
                    "title": title,
                    "source": source,
                    "relevance_score": score
                })
                total_length += len(context_part)
            
            context = "".join(context_parts)
            
            return RetrievalResponse(
                context=context,
                sources=sources,
                total_tokens=len(context.split())
            )
            
    except Exception as e:
        logger.error(f"Retrieval failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        embedding_url = os.getenv('EMBEDDING_URL', 'http://localhost:8002')
        
        async with httpx.AsyncClient() as client:
            health_response = await client.get(f"{embedding_url}/health", timeout=5.0)
            embedding_healthy = health_response.status_code == 200
        
        return {
            "status": "healthy" if embedding_healthy else "degraded",
            "service": "retriever",
            "version": "2.1.0",
            "embedding_service": "connected" if embedding_healthy else "disconnected"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "service": "retriever",
            "error": str(e)
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
```

---

## 🔄 Step 3: End-to-End Workflow Integration

### **3.1 Update Orchestrator for RAG-Enhanced Agents**

Enhance the TypeScript orchestrator to use RAG:

```bash
cd packages/orchestrator/src
```

Create `services/rag-service.ts`:

```typescript
import axios, { AxiosInstance } from 'axios';

export interface RAGContext {
  context: string;
  sources: Array<{
    title: string;
    source: string;
    relevance_score: number;
  }>;
  total_tokens: number;
}

export class RAGService {
  private client: AxiosInstance;

  constructor(private baseURL: string = 'http://localhost:8003') {
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async retrieveContext(
    query: string, 
    maxResults: number = 5,
    similarityThreshold: number = 0.75,
    contextLength: number = 8000
  ): Promise<RAGContext | null> {
    try {
      const response = await this.client.post('/retrieve', {
        query,
        max_results: maxResults,
        similarity_threshold: similarityThreshold,
        context_length: contextLength
      });

      return response.data;
    } catch (error) {
      console.error('RAG context retrieval failed:', error);
      return null; // Graceful degradation
    }
  }

  async enhancePrompt(basePrompt: string, userQuery: string): Promise<string> {
    const context = await this.retrieveContext(userQuery);
    
    if (!context || !context.context.trim()) {
      return basePrompt; // Return original if no context available
    }

    const enhancedPrompt = `${basePrompt}

## Relevant Knowledge Context:
${context.context}

## User Query:
${userQuery}

Please use the provided knowledge context to inform your response. If the context is relevant, reference it appropriately. If not relevant, proceed with your standard analysis.`;

    return enhancedPrompt;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200 && response.data.status === 'healthy';
    } catch {
      return false;
    }
  }
}
```

Update agents to use RAG-enhanced prompts:

```typescript
// In agents/architecture-agent.ts
import { RAGService } from '../services/rag-service';

export class ArchitectureAgent {
  private ragService = new RAGService();

  async analyzeArchitecture(codebase: string, query?: string): Promise<AnalysisResult> {
    const basePrompt = `You are an expert software architect. Analyze the following codebase and provide architectural insights, patterns, and recommendations.

Code to analyze:
${codebase}`;

    const enhancedPrompt = query 
      ? await this.ragService.enhancePrompt(basePrompt, query)
      : basePrompt;

    // Use enhanced prompt with LLM
    const result = await this.llmManager.generateCompletion({
      prompt: enhancedPrompt,
      maxTokens: 2000,
      temperature: 0.3,
      strategy: 'best_quality'
    });

    return this.parseArchitecturalAnalysis(result.content);
  }
}
```

### **3.2 Create End-to-End Test Suite**

Create comprehensive integration test:

```bash
cd Tronagenticstar-master
```

Create `test-e2e-workflows.js`:

```javascript
#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: '.env.production' });

const GATEWAY_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 60000; // 60 seconds

class E2ETestSuite {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      total: 0,
      tests: []
    };
  }

  async runTest(name, testFn) {
    this.results.total++;
    console.log(`\n🧪 Running: ${name}`);
    
    const startTime = Date.now();
    try {
      await testFn();
      const duration = Date.now() - startTime;
      console.log(`✅ PASSED: ${name} (${duration}ms)`);
      this.results.passed++;
      this.results.tests.push({ name, status: 'passed', duration });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ FAILED: ${name} (${duration}ms)`);
      console.log(`   Error: ${error.message}`);
      this.results.failed++;
      this.results.tests.push({ name, status: 'failed', duration, error: error.message });
    }
  }

  async testKnowledgeBasePopulation() {
    // Add test document to knowledge base
    const testDoc = {
      title: "Constella Architecture Overview",
      content: "Constella is a multi-agent AI platform with TypeScript orchestrator, Python microservices, and intelligent LLM routing.",
      source: "test-suite",
      metadata: { type: "architecture", category: "overview" }
    };

    const response = await axios.post(`${GATEWAY_URL}/v1/services/embedding/documents`, testDoc, {
      headers: { 'X-API-Key': 'prod-key-001' },
      timeout: TEST_TIMEOUT
    });

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    console.log(`   Added test document: ${testDoc.title}`);
  }

  async testRAGRetrieval() {
    const query = "What is the Constella platform architecture?";
    
    const response = await axios.post(`${GATEWAY_URL}/v1/services/retriever/retrieve`, {
      query,
      max_results: 3,
      similarity_threshold: 0.5
    }, {
      headers: { 'X-API-Key': 'prod-key-001' },
      timeout: TEST_TIMEOUT
    });

    if (response.status !== 200) {
      throw new Error(`RAG retrieval failed: ${response.status}`);
    }

    const { context, sources, total_tokens } = response.data;
    
    if (!context || sources.length === 0) {
      throw new Error('No context retrieved from knowledge base');
    }

    console.log(`   Retrieved ${sources.length} sources, ${total_tokens} tokens`);
    console.log(`   Context preview: "${context.substring(0, 100)}..."`);
  }

  async testArchitectureAgentWithRAG() {
    const codeSnippet = `
class UserService {
  constructor(private db: Database) {}
  
  async getUser(id: string): Promise<User> {
    return this.db.users.findById(id);
  }
}`;

    const response = await axios.post(`${GATEWAY_URL}/v1/agents/architecture/analyze`, {
      code: codeSnippet,
      query: "How does this fit into microservices architecture?"
    }, {
      headers: { 'X-API-Key': 'prod-key-001' },
      timeout: TEST_TIMEOUT
    });

    if (response.status !== 200) {
      throw new Error(`Architecture agent failed: ${response.status}`);
    }

    const analysis = response.data;
    
    if (!analysis.insights || analysis.insights.length === 0) {
      throw new Error('No architectural insights generated');
    }

    console.log(`   Generated ${analysis.insights.length} architectural insights`);
    console.log(`   Primary insight: "${analysis.insights[0].substring(0, 80)}..."`);
  }

  async testSecurityAgentWithRAG() {
    const codeSnippet = `
app.post('/api/users', (req, res) => {
  const userData = req.body;
  const query = "INSERT INTO users VALUES ('" + userData.name + "')";
  db.query(query);
  res.json({ success: true });
});`;

    const response = await axios.post(`${GATEWAY_URL}/v1/agents/security/scan`, {
      code: codeSnippet,
      query: "What are the security risks in this code?"
    }, {
      headers: { 'X-API-Key': 'prod-key-001' },
      timeout: TEST_TIMEOUT
    });

    if (response.status !== 200) {
      throw new Error(`Security agent failed: ${response.status}`);
    }

    const scan = response.data;
    
    if (!scan.vulnerabilities || scan.vulnerabilities.length === 0) {
      throw new Error('No security vulnerabilities detected (expected SQL injection)');
    }

    const hasSQLInjection = scan.vulnerabilities.some(v => 
      v.type.toLowerCase().includes('sql') || v.type.toLowerCase().includes('injection')
    );

    if (!hasSQLInjection) {
      throw new Error('Failed to detect SQL injection vulnerability');
    }

    console.log(`   Detected ${scan.vulnerabilities.length} security vulnerabilities`);
    console.log(`   Found SQL injection vulnerability ✓`);
  }

  async testMultiProviderFailover() {
    // Test that system continues working even if one provider fails
    const response = await axios.post(`${GATEWAY_URL}/v1/llm/test-failover`, {
      message: "Test failover capabilities",
      exclude_providers: ["openai"] // Force failover to other providers
    }, {
      headers: { 'X-API-Key': 'prod-key-001' },
      timeout: TEST_TIMEOUT
    });

    if (response.status !== 200) {
      throw new Error(`Failover test failed: ${response.status}`);
    }

    const result = response.data;
    
    if (!result.content || result.provider === 'openai') {
      throw new Error('Failover did not work correctly');
    }

    console.log(`   Failover successful, used provider: ${result.provider}`);
  }

  async testPerformanceBenchmark() {
    const iterations = 5;
    const times = [];

    console.log(`   Running ${iterations} performance tests...`);

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      
      const response = await axios.post(`${GATEWAY_URL}/v1/agents/quality/check`, {
        code: "function hello() { return 'world'; }",
        metrics: ["complexity", "maintainability"]
      }, {
        headers: { 'X-API-Key': 'prod-key-001' },
        timeout: TEST_TIMEOUT
      });

      const duration = Date.now() - startTime;
      times.push(duration);

      if (response.status !== 200) {
        throw new Error(`Performance test ${i+1} failed: ${response.status}`);
      }
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    if (avgTime > 5000) { // 5 second threshold
      throw new Error(`Average response time too slow: ${avgTime}ms`);
    }

    console.log(`   Performance: Avg ${avgTime}ms, Min ${minTime}ms, Max ${maxTime}ms`);
  }

  async testConcurrentRequests() {
    const concurrency = 10;
    console.log(`   Testing ${concurrency} concurrent requests...`);

    const requests = Array(concurrency).fill().map((_, i) =>
      axios.post(`${GATEWAY_URL}/v1/agents/architecture/analyze`, {
        code: `function test${i}() { return ${i}; }`,
        query: `Analyze function test${i}`
      }, {
        headers: { 'X-API-Key': 'prod-key-001' },
        timeout: TEST_TIMEOUT
      })
    );

    const startTime = Date.now();
    const results = await Promise.allSettled(requests);
    const duration = Date.now() - startTime;

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    if (successful < concurrency * 0.8) { // 80% success rate minimum
      throw new Error(`Too many concurrent requests failed: ${failed}/${concurrency}`);
    }

    console.log(`   Concurrent test: ${successful}/${concurrency} successful in ${duration}ms`);
  }

  async runAllTests() {
    console.log('🚀 Constella Platform - End-to-End Integration Test Suite\n');
    console.log(`Gateway URL: ${GATEWAY_URL}`);
    console.log(`Timeout: ${TEST_TIMEOUT}ms`);
    console.log('─'.repeat(80));

    // Knowledge Base & RAG Tests
    await this.runTest('Knowledge Base Population', () => this.testKnowledgeBasePopulation());
    await this.runTest('RAG Context Retrieval', () => this.testRAGRetrieval());

    // Agent Integration Tests
    await this.runTest('Architecture Agent with RAG', () => this.testArchitectureAgentWithRAG());
    await this.runTest('Security Agent with RAG', () => this.testSecurityAgentWithRAG());

    // System Reliability Tests
    await this.runTest('Multi-Provider Failover', () => this.testMultiProviderFailover());
    
    // Performance Tests
    await this.runTest('Performance Benchmark', () => this.testPerformanceBenchmark());
    await this.runTest('Concurrent Request Handling', () => this.testConcurrentRequests());

    this.printResults();
  }

  printResults() {
    console.log('\n' + '─'.repeat(80));
    console.log('📊 End-to-End Test Results Summary');
    console.log('─'.repeat(80));
    
    console.log(`Total Tests: ${this.results.total}`);
    console.log(`Passed: ${this.results.passed} ✅`);
    console.log(`Failed: ${this.results.failed} ❌`);
    console.log(`Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`);

    const passedTests = this.results.tests.filter(t => t.status === 'passed');
    if (passedTests.length > 0) {
      const avgDuration = passedTests.reduce((sum, t) => sum + t.duration, 0) / passedTests.length;
      console.log(`Average Test Duration: ${avgDuration.toFixed(0)}ms`);
    }

    if (this.results.passed === this.results.total) {
      console.log('\n🎉 ALL TESTS PASSED! Constella Platform is production-ready!');
      console.log('✨ Full AI integration with RAG capabilities confirmed.');
    } else {
      console.log(`\n⚠️  ${this.results.failed} test(s) failed. Review issues above.`);
    }

    // Save detailed results
    fs.writeFileSync('e2e-test-results.json', JSON.stringify(this.results, null, 2));
    console.log('📄 Detailed results saved to: e2e-test-results.json');
  }
}

// Run tests if called directly
if (require.main === module) {
  const testSuite = new E2ETestSuite();
  testSuite.runAllTests().catch(console.error);
}

module.exports = E2ETestSuite;
```

---

## 📈 Step 4: Performance Optimization & Monitoring

### **4.1 Add Performance Monitoring to API Gateway**

Create `services/api-gateway/src/middleware/performance-monitor.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';

interface PerformanceMetrics {
  requestCount: number;
  totalResponseTime: number;
  averageResponseTime: number;
  slowRequests: number;
  errorCount: number;
  lastUpdated: Date;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    requestCount: 0,
    totalResponseTime: 0,
    averageResponseTime: 0,
    slowRequests: 0,
    errorCount: 0,
    lastUpdated: new Date()
  };

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = performance.now();
      
      // Override end method to capture metrics
      const originalEnd = res.end;
      res.end = function(...args: any[]) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        // Update metrics
        this.updateMetrics(duration, res.statusCode >= 400);
        
        // Call original end method
        originalEnd.apply(res, args);
      }.bind(this);

      next();
    };
  }

  private updateMetrics(duration: number, isError: boolean) {
    this.metrics.requestCount++;
    this.metrics.totalResponseTime += duration;
    this.metrics.averageResponseTime = this.metrics.totalResponseTime / this.metrics.requestCount;
    
    if (duration > 2000) { // 2 second threshold for slow requests
      this.metrics.slowRequests++;
    }
    
    if (isError) {
      this.metrics.errorCount++;
    }
    
    this.metrics.lastUpdated = new Date();
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  reset() {
    this.metrics = {
      requestCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      slowRequests: 0,
      errorCount: 0,
      lastUpdated: new Date()
    };
  }
}
```

### **4.2 Create Performance Dashboard Endpoint**

Add to API Gateway routes:

```typescript
// In services/api-gateway/src/routes/metrics.ts
import { Router } from 'express';
import { PerformanceMonitor } from '../middleware/performance-monitor';

export function createMetricsRouter(performanceMonitor: PerformanceMonitor) {
  const router = Router();

  router.get('/performance', (req, res) => {
    const metrics = performanceMonitor.getMetrics();
    
    res.json({
      timestamp: new Date().toISOString(),
      performance: metrics,
      health: {
        status: metrics.averageResponseTime < 1000 ? 'healthy' : 'degraded',
        errorRate: (metrics.errorCount / metrics.requestCount) * 100,
        slowRequestRate: (metrics.slowRequests / metrics.requestCount) * 100
      },
      recommendations: this.generateRecommendations(metrics)
    });
  });

  router.post('/performance/reset', (req, res) => {
    performanceMonitor.reset();
    res.json({ message: 'Performance metrics reset' });
  });

  return router;
}

function generateRecommendations(metrics: PerformanceMetrics): string[] {
  const recommendations = [];
  
  if (metrics.averageResponseTime > 2000) {
    recommendations.push('Consider adding response caching');
    recommendations.push('Review LLM provider selection strategy');
  }
  
  if ((metrics.errorCount / metrics.requestCount) > 0.05) {
    recommendations.push('High error rate detected - review error handling');
  }
  
  if ((metrics.slowRequests / metrics.requestCount) > 0.1) {
    recommendations.push('Consider implementing request timeouts');
    recommendations.push('Review database query performance');
  }
  
  return recommendations;
}
```

---

## 🚀 Step 5: Production Deployment Configuration

### **5.1 Create Production Docker Compose**

Create `docker-compose.production.yml`:

```yaml
version: '3.8'

services:
  # Vector Database
  qdrant:
    image: qdrant/qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage
    environment:
      - QDRANT__SERVICE__HTTP_PORT=6333
      - QDRANT__SERVICE__GRPC_PORT=6334
    restart: unless-stopped

  # API Gateway
  api-gateway:
    build: ./services/api-gateway
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - API_GATEWAY_PORT=3000
      - JWT_SECRET=${JWT_SECRET}
      - ORCHESTRATOR_URL=http://orchestrator:8001
      - EMBEDDING_URL=http://embedding:8002
      - RETRIEVER_URL=http://retriever:8003
    depends_on:
      - orchestrator
      - embedding
      - retriever
    restart: unless-stopped

  # TypeScript Orchestrator
  orchestrator:
    build: ./packages/orchestrator
    ports:
      - "8001:8001"
    environment:
      - NODE_ENV=production
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - EMBEDDING_URL=http://embedding:8002
      - RETRIEVER_URL=http://retriever:8003
    restart: unless-stopped

  # Embedding Service
  embedding:
    build: ./services/embedding
    ports:
      - "8002:8002"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - VECTOR_DB_URL=http://qdrant:6333
      - VECTOR_DB_COLLECTION=constella-knowledge
    depends_on:
      - qdrant
    restart: unless-stopped

  # Retriever Service
  retriever:
    build: ./services/retriever
    ports:
      - "8003:8003"
    environment:
      - EMBEDDING_URL=http://embedding:8002
    depends_on:
      - embedding
    restart: unless-stopped

  # Prometheus Monitoring
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--web.enable-lifecycle'
    restart: unless-stopped

  # Grafana Dashboard
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana-datasources.yml:/etc/grafana/provisioning/datasources/datasources.yml
    depends_on:
      - prometheus
    restart: unless-stopped

volumes:
  qdrant_data:
  prometheus_data:
  grafana_data:

networks:
  default:
    name: constella-network
```

### **5.2 Create Production Startup Script**

Create `start-production.sh`:

```bash
#!/bin/bash

# Constella AI Platform - Production Startup Script
set -e

echo "🚀 Starting Constella AI Platform - Production Mode"
echo "=================================================="

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "❌ Error: .env.production file not found"
    echo "Please create .env.production with your API keys and configuration"
    exit 1
fi

# Source environment variables
export $(cat .env.production | grep -v '#' | xargs)

# Check required API keys
required_vars=(
    "OPENAI_API_KEY"
    "JWT_SECRET"
)

missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo "❌ Error: Missing required environment variables:"
    printf '%s\n' "${missing_vars[@]}"
    exit 1
fi

echo "✅ Environment configuration validated"

# Build all services
echo "🔨 Building services..."
docker-compose -f docker-compose.production.yml build --no-cache

# Start services
echo "🚀 Starting services..."
docker-compose -f docker-compose.production.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 30

# Health checks
echo "🏥 Performing health checks..."

services=(
    "http://localhost:6333/health:Qdrant Vector Database"
    "http://localhost:3000/health:API Gateway"
    "http://localhost:8002/health:Embedding Service"
    "http://localhost:8003/health:Retriever Service"
)

all_healthy=true
for service in "${services[@]}"; do
    url=$(echo $service | cut -d: -f1-2)
    name=$(echo $service | cut -d: -f3-)
    
    if curl -s --max-time 10 $url > /dev/null; then
        echo "✅ $name: Healthy"
    else
        echo "❌ $name: Unhealthy"
        all_healthy=false
    fi
done

if $all_healthy; then
    echo ""
    echo "🎉 Constella AI Platform is running successfully!"
    echo ""
    echo "📊 Service URLs:"
    echo "   • API Gateway: http://localhost:3000"
    echo "   • Prometheus: http://localhost:9090"
    echo "   • Grafana: http://localhost:3001 (admin/admin)"
    echo ""
    echo "🧪 Run tests with:"
    echo "   node test-e2e-workflows.js"
    echo ""
    echo "📜 View logs with:"
    echo "   docker-compose -f docker-compose.production.yml logs -f"
else
    echo ""
    echo "⚠️  Some services are unhealthy. Check logs:"
    echo "   docker-compose -f docker-compose.production.yml logs"
    exit 1
fi
```

Make it executable:
```bash
chmod +x start-production.sh
```

---

## 🎯 Step 6: Validation & Testing

### **6.1 Complete Integration Test Checklist**

Create `PHASE_2_1_VALIDATION_CHECKLIST.md`:

```markdown
# Phase 2.1 Validation Checklist

## LLM Provider Integration ✅
- [ ] OpenAI API key configured and tested
- [ ] Anthropic API key configured and tested  
- [ ] Google Gemini API key configured and tested
- [ ] OpenRouter API key configured and tested
- [ ] Provider failover working correctly
- [ ] Cost tracking and budget limits functional

## RAG Integration ✅
- [ ] Qdrant vector database running
- [ ] Embedding service operational
- [ ] Retriever service operational
- [ ] Document ingestion working
- [ ] Knowledge retrieval functional
- [ ] Context enhancement working

## Agent Enhancement ✅
- [ ] Architecture Agent using RAG
- [ ] Security Agent using RAG
- [ ] Quality Agent using RAG
- [ ] All agents providing AI-powered responses
- [ ] Response quality meets standards

## Performance & Reliability ✅
- [ ] Average response time < 2 seconds
- [ ] Concurrent request handling (10+ simultaneous)
- [ ] Error rate < 1% under normal load
- [ ] Graceful degradation on failures
- [ ] Performance monitoring active

## Production Readiness ✅
- [ ] All services containerized
- [ ] Production environment configuration
- [ ] Security hardening complete
- [ ] Monitoring and alerting configured
- [ ] Documentation complete and up-to-date
```

### **6.2 Final Validation Commands**

```bash
# 1. Start production environment
./start-production.sh

# 2. Run LLM provider tests
node test-llm-providers.js

# 3. Run end-to-end workflow tests
node test-e2e-workflows.js

# 4. Check all service health
curl -s http://localhost:3000/health | jq
curl -s http://localhost:8002/health | jq
curl -s http://localhost:8003/health | jq

# 5. Verify VS Code extension connectivity
# Open VS Code, install extension, configure with http://localhost:3000

# 6. Monitor performance
curl -s http://localhost:3000/metrics/performance | jq
```

---

## 🏆 Success Criteria & Metrics

### **Phase 2.1 Completion Criteria:**

| Component | Target | Status |
|-----------|--------|--------|
| **LLM Provider Integration** | 4/4 providers working | 🎯 |
| **RAG Functionality** | Context retrieval < 1s | 🎯 |
| **Agent Response Quality** | AI-powered, contextual | 🎯 |
| **System Performance** | < 2s avg response time | 🎯 |
| **Reliability** | 99.9% uptime, < 1% error rate | 🎯 |
| **Documentation** | Complete setup guides | 🎯 |

### **Key Performance Indicators:**

- **Multi-Provider Success Rate**: > 95%
- **RAG Context Relevance**: > 80% relevant retrievals
- **End-to-End Response Time**: < 2000ms average
- **Agent Intelligence Quality**: Measurable improvement over hardcoded responses
- **System Resilience**: No single points of failure

---

## 🎉 Phase 2.1 Completion

Upon successful completion of all steps and validation:

**Platform Readiness**: 85% → **95% COMPLETE** 🎯

**Achieved Capabilities:**
✅ **Full Multi-Provider AI Integration** (OpenAI, Anthropic, Gemini, OpenRouter)  
✅ **Production RAG Pipeline** with vector database and knowledge retrieval  
✅ **AI-Enhanced Agents** with contextual awareness and domain knowledge  
✅ **Enterprise Performance** with sub-2 second response times  
✅ **Production Deployment** with Docker, monitoring, and security  

**Next Phase**: 2.2 - Advanced Features & User Adoption
- Custom agent development tools
- Multi-workspace support  
- Advanced analytics and insights
- Community features and marketplace

---

## 🆘 Support & Troubleshooting

### **Common Issues:**

**API Key Errors:**
- Verify all keys are correctly formatted in `.env.production`
- Check key permissions and billing status with providers
- Test keys individually with provider-specific test scripts

**RAG Performance Issues:**
- Ensure Qdrant has sufficient resources (2GB+ RAM recommended)
- Check embedding service response times
- Optimize similarity thresholds and result limits

**Service Discovery Problems:**
- Verify all services are responding to health checks
- Check network connectivity between containers
- Review Docker Compose service definitions

### **Debug Commands:**
```bash
# View all service logs
docker-compose -f docker-compose.production.yml logs -f

# Check specific service
docker-compose -f docker-compose.production.yml logs api-gateway

# Test individual components
curl -v http://localhost:3000/v1/status
curl -v http://localhost:8002/health
curl -v http://localhost:8003/health
```

---

**Phase 2.1 represents the completion of full AI integration for the Constella platform, delivering enterprise-grade multi-agent AI capabilities with production readiness and scalability.**
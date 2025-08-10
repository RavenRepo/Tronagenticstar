# Gap 4: End-to-End RAG Pipeline Implementation

## Problem Statement

Current retrieval-augmented generation (RAG) capabilities are incomplete and fragmented:
- Embedding service exists but no ingestion pipeline
- Retriever service has basic functionality but no knowledge management
- No end-to-end document processing and indexing
- Missing context-aware retrieval with agent specialization
- No knowledge base versioning or update mechanisms

## Current State Analysis

**Existing Components:**
- Basic embedding service (`services/embedding/main.py`)
- Retriever service with relationship testing (`services/retriever/`)
- Memory bank structure in TypeScript orchestrator
- Neo4j configuration in docker-compose

**Identified Issues:**
- No document ingestion or preprocessing pipeline
- Embedding service only provides endpoint, no batch processing
- Retriever lacks semantic search and ranking
- No knowledge graph construction or management
- Missing domain-specific knowledge organization

## Technical Architecture

### 1. Knowledge Ingestion Pipeline

```python
# New service: services/knowledge-ingestion/
├── src/
│   ├── ingestion/
│   │   ├── crawlers/          # Web crawling and API ingestion
│   │   ├── processors/        # Document processing
│   │   ├── extractors/        # Content extraction
│   │   └── validators/        # Content validation
│   ├── preprocessing/
│   │   ├── chunking.py        # Text chunking strategies
│   │   ├── cleaning.py        # Content cleaning
│   │   ├── enrichment.py      # Metadata enrichment
│   │   └── deduplication.py   # Duplicate detection
│   ├── indexing/
│   │   ├── vector_store.py    # Vector database management
│   │   ├── graph_builder.py   # Knowledge graph construction
│   │   ├── entity_extractor.py # Named entity recognition
│   │   └── relationship_mapper.py # Relationship extraction
│   └── pipeline/
│       ├── orchestrator.py    # Pipeline orchestration
│       ├── scheduler.py       # Batch processing
│       └── monitoring.py      # Pipeline monitoring
```

### 2. Enhanced Vector Storage

```python
# Enhanced vector storage with metadata
class VectorStore:
    def __init__(self, 
                 dimension: int = 1536,
                 similarity_metric: str = "cosine",
                 index_type: str = "hnsw"):
        self.dimension = dimension
        self.similarity_metric = similarity_metric
        self.index_type = index_type
        
    async def upsert_documents(self, documents: List[Document]) -> List[str]:
        """Upsert documents with embeddings and metadata"""
        
    async def semantic_search(self, 
                            query: str,
                            filters: Dict[str, Any] = None,
                            top_k: int = 10,
                            min_score: float = 0.7) -> List[SearchResult]:
        """Perform semantic search with optional filters"""
        
    async def hybrid_search(self,
                          query: str,
                          keywords: List[str] = None,
                          semantic_weight: float = 0.7,
                          keyword_weight: float = 0.3) -> List[SearchResult]:
        """Combine semantic and keyword search"""
```

### 3. Knowledge Graph Integration

```python
# Graph-based knowledge representation
class KnowledgeGraph:
    def __init__(self, neo4j_uri: str, credentials: Dict[str, str]):
        self.driver = neo4j.GraphDatabase.driver(neo4j_uri, auth=credentials)
        
    async def create_document_node(self, document: Document) -> str:
        """Create document node with properties"""
        
    async def extract_entities(self, content: str) -> List[Entity]:
        """Extract named entities from content"""
        
    async def build_relationships(self, entities: List[Entity]) -> List[Relationship]:
        """Build relationships between entities"""
        
    async def query_related_concepts(self, 
                                   concept: str,
                                   max_depth: int = 2) -> List[RelatedConcept]:
        """Find related concepts through graph traversal"""
```

## Implementation Plan

### Week 1: Knowledge Ingestion Foundation

**Day 1-2: Document Processing Pipeline**
```python
# services/knowledge-ingestion/src/processors/document_processor.py
import asyncio
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from pathlib import Path
import aiofiles
import magic
from PyPDF2 import PdfReader
from docx import Document as DocxDocument
import markdown
from bs4 import BeautifulSoup

@dataclass
class ProcessedDocument:
    id: str
    content: str
    metadata: Dict[str, Any]
    chunks: List[str]
    entities: List[str]
    relationships: List[Dict[str, str]]

class DocumentProcessor:
    def __init__(self):
        self.supported_types = {
            'application/pdf': self._process_pdf,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': self._process_docx,
            'text/plain': self._process_text,
            'text/markdown': self._process_markdown,
            'text/html': self._process_html,
            'application/json': self._process_json,
        }
        
    async def process_file(self, file_path: Path) -> ProcessedDocument:
        """Process a single file and extract structured content"""
        mime_type = magic.from_file(str(file_path), mime=True)
        
        if mime_type not in self.supported_types:
            raise ValueError(f"Unsupported file type: {mime_type}")
        
        processor = self.supported_types[mime_type]
        content, metadata = await processor(file_path)
        
        # Generate document ID
        doc_id = self._generate_doc_id(file_path, content)
        
        # Extract metadata
        enhanced_metadata = await self._extract_metadata(file_path, content, metadata)
        
        # Chunk content
        chunks = await self._chunk_content(content, enhanced_metadata)
        
        # Extract entities
        entities = await self._extract_entities(content)
        
        # Extract relationships
        relationships = await self._extract_relationships(content, entities)
        
        return ProcessedDocument(
            id=doc_id,
            content=content,
            metadata=enhanced_metadata,
            chunks=chunks,
            entities=entities,
            relationships=relationships
        )
    
    async def process_batch(self, file_paths: List[Path]) -> List[ProcessedDocument]:
        """Process multiple files concurrently"""
        tasks = [self.process_file(path) for path in file_paths]
        return await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _process_pdf(self, file_path: Path) -> tuple[str, Dict[str, Any]]:
        """Extract text and metadata from PDF"""
        async with aiofiles.open(file_path, 'rb') as file:
            content = await file.read()
            reader = PdfReader(io.BytesIO(content))
            
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
            
            metadata = {
                'page_count': len(reader.pages),
                'title': reader.metadata.get('/Title', ''),
                'author': reader.metadata.get('/Author', ''),
                'subject': reader.metadata.get('/Subject', ''),
                'creator': reader.metadata.get('/Creator', ''),
            }
            
            return text, metadata
    
    async def _process_docx(self, file_path: Path) -> tuple[str, Dict[str, Any]]:
        """Extract text and metadata from DOCX"""
        doc = DocxDocument(file_path)
        
        text = ""
        for paragraph in doc.paragraphs:
            text += paragraph.text + "\n"
        
        metadata = {
            'title': doc.core_properties.title or '',
            'author': doc.core_properties.author or '',
            'subject': doc.core_properties.subject or '',
            'created': doc.core_properties.created,
            'modified': doc.core_properties.modified,
        }
        
        return text, metadata
    
    async def _chunk_content(self, content: str, metadata: Dict[str, Any]) -> List[str]:
        """Split content into meaningful chunks"""
        chunker = ContentChunker(
            chunk_size=1000,
            chunk_overlap=200,
            preserve_structure=True
        )
        return await chunker.chunk(content, metadata)
    
    async def _extract_entities(self, content: str) -> List[str]:
        """Extract named entities from content"""
        entity_extractor = EntityExtractor()
        return await entity_extractor.extract(content)
    
    async def _extract_relationships(self, content: str, entities: List[str]) -> List[Dict[str, str]]:
        """Extract relationships between entities"""
        relationship_extractor = RelationshipExtractor()
        return await relationship_extractor.extract(content, entities)

# Content chunking strategies
class ContentChunker:
    def __init__(self, 
                 chunk_size: int = 1000,
                 chunk_overlap: int = 200,
                 preserve_structure: bool = True):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.preserve_structure = preserve_structure
    
    async def chunk(self, content: str, metadata: Dict[str, Any]) -> List[str]:
        """Intelligent content chunking"""
        if self.preserve_structure:
            return await self._semantic_chunking(content)
        else:
            return await self._fixed_size_chunking(content)
    
    async def _semantic_chunking(self, content: str) -> List[str]:
        """Chunk based on semantic boundaries"""
        # Split by paragraphs, sections, etc.
        paragraphs = content.split('\n\n')
        chunks = []
        current_chunk = ""
        
        for paragraph in paragraphs:
            if len(current_chunk) + len(paragraph) > self.chunk_size:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = paragraph
            else:
                current_chunk += "\n\n" + paragraph if current_chunk else paragraph
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks
    
    async def _fixed_size_chunking(self, content: str) -> List[str]:
        """Fixed-size chunking with overlap"""
        chunks = []
        start = 0
        
        while start < len(content):
            end = start + self.chunk_size
            chunk = content[start:end]
            chunks.append(chunk)
            start = end - self.chunk_overlap
        
        return chunks
```

**Day 3-4: Entity and Relationship Extraction**
```python
# services/knowledge-ingestion/src/extractors/entity_extractor.py
import spacy
from transformers import AutoTokenizer, AutoModelForTokenClassification
from transformers import pipeline
import asyncio
from typing import List, Dict, Any

class EntityExtractor:
    def __init__(self):
        # Load spaCy model for general NER
        self.nlp = spacy.load("en_core_web_sm")
        
        # Load transformer model for specialized NER
        self.ner_pipeline = pipeline(
            "ner",
            model="dbmdz/bert-large-cased-finetuned-conll03-english",
            aggregation_strategy="simple"
        )
        
        # Domain-specific extractors
        self.domain_extractors = {
            'technical': TechnicalEntityExtractor(),
            'business': BusinessEntityExtractor(),
            'security': SecurityEntityExtractor(),
        }
    
    async def extract(self, content: str, domain: str = 'general') -> List[Dict[str, Any]]:
        """Extract entities from content"""
        # General NER with spaCy
        spacy_entities = await self._extract_spacy_entities(content)
        
        # Transformer-based NER
        transformer_entities = await self._extract_transformer_entities(content)
        
        # Domain-specific extraction
        domain_entities = []
        if domain in self.domain_extractors:
            domain_entities = await self.domain_extractors[domain].extract(content)
        
        # Merge and deduplicate entities
        all_entities = spacy_entities + transformer_entities + domain_entities
        return await self._merge_entities(all_entities)
    
    async def _extract_spacy_entities(self, content: str) -> List[Dict[str, Any]]:
        """Extract entities using spaCy"""
        doc = self.nlp(content)
        entities = []
        
        for ent in doc.ents:
            entities.append({
                'text': ent.text,
                'label': ent.label_,
                'start': ent.start_char,
                'end': ent.end_char,
                'confidence': 1.0,  # spaCy doesn't provide confidence scores
                'source': 'spacy'
            })
        
        return entities
    
    async def _extract_transformer_entities(self, content: str) -> List[Dict[str, Any]]:
        """Extract entities using transformer model"""
        # Process in chunks to handle long content
        chunks = self._split_content(content, max_length=512)
        all_entities = []
        
        for chunk_start, chunk_text in chunks:
            entities = self.ner_pipeline(chunk_text)
            
            for entity in entities:
                all_entities.append({
                    'text': entity['word'],
                    'label': entity['entity_group'],
                    'start': chunk_start + entity['start'],
                    'end': chunk_start + entity['end'],
                    'confidence': entity['score'],
                    'source': 'transformer'
                })
        
        return all_entities

class TechnicalEntityExtractor:
    """Extract technical entities (APIs, frameworks, technologies)"""
    
    def __init__(self):
        self.patterns = [
            r'\b[A-Z][a-zA-Z]*API\b',  # APIs
            r'\b\w+\.(js|py|java|go|rs)\b',  # File extensions
            r'\b(Docker|Kubernetes|AWS|Azure|GCP)\b',  # Platforms
            r'\b(REST|GraphQL|gRPC)\b',  # Protocols
        ]
    
    async def extract(self, content: str) -> List[Dict[str, Any]]:
        """Extract technical entities"""
        entities = []
        
        for pattern in self.patterns:
            matches = re.finditer(pattern, content, re.IGNORECASE)
            for match in matches:
                entities.append({
                    'text': match.group(),
                    'label': 'TECHNICAL',
                    'start': match.start(),
                    'end': match.end(),
                    'confidence': 0.9,
                    'source': 'pattern'
                })
        
        return entities

# Relationship extraction
class RelationshipExtractor:
    def __init__(self):
        self.dependency_patterns = [
            # Subject-Verb-Object patterns
            r'(\w+)\s+(uses|implements|extends|depends on|integrates with)\s+(\w+)',
            # API relationships
            r'(\w+)\s+(calls|invokes|triggers)\s+(\w+)',
            # Data flow patterns
            r'(\w+)\s+(sends|receives|processes)\s+(\w+)',
        ]
    
    async def extract(self, content: str, entities: List[str]) -> List[Dict[str, str]]:
        """Extract relationships between entities"""
        relationships = []
        
        # Pattern-based extraction
        for pattern in self.dependency_patterns:
            matches = re.finditer(pattern, content, re.IGNORECASE)
            for match in matches:
                subject, relation, obj = match.groups()
                
                if subject in entities and obj in entities:
                    relationships.append({
                        'subject': subject,
                        'predicate': relation,
                        'object': obj,
                        'confidence': 0.8,
                        'source': 'pattern'
                    })
        
        # Dependency parsing with spaCy
        doc = self.nlp(content)
        for sent in doc.sents:
            relationships.extend(self._extract_dependency_relationships(sent, entities))
        
        return relationships
    
    def _extract_dependency_relationships(self, sent, entities: List[str]) -> List[Dict[str, str]]:
        """Extract relationships using dependency parsing"""
        relationships = []
        
        for token in sent:
            if token.text in entities and token.head.text in entities:
                relationships.append({
                    'subject': token.text,
                    'predicate': token.dep_,
                    'object': token.head.text,
                    'confidence': 0.7,
                    'source': 'dependency'
                })
        
        return relationships
```

**Day 5: Vector Database Integration**
```python
# services/knowledge-ingestion/src/indexing/vector_store.py
import asyncio
import numpy as np
from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings
import weaviate
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

class UnifiedVectorStore:
    """Unified interface for multiple vector databases"""
    
    def __init__(self, provider: str = "chroma", **config):
        self.provider = provider
        self.config = config
        self.client = self._initialize_client()
    
    def _initialize_client(self):
        """Initialize the appropriate vector database client"""
        if self.provider == "chroma":
            return ChromaDBAdapter(self.config)
        elif self.provider == "weaviate":
            return WeaviateAdapter(self.config)
        elif self.provider == "qdrant":
            return QdrantAdapter(self.config)
        else:
            raise ValueError(f"Unsupported vector store provider: {self.provider}")
    
    async def create_collection(self, 
                              name: str,
                              dimension: int = 1536,
                              distance_metric: str = "cosine") -> bool:
        """Create a new collection"""
        return await self.client.create_collection(name, dimension, distance_metric)
    
    async def upsert_documents(self,
                             collection: str,
                             documents: List[Dict[str, Any]]) -> List[str]:
        """Upsert documents with embeddings"""
        return await self.client.upsert_documents(collection, documents)
    
    async def search(self,
                    collection: str,
                    query_vector: List[float],
                    top_k: int = 10,
                    filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Perform vector similarity search"""
        return await self.client.search(collection, query_vector, top_k, filters)
    
    async def hybrid_search(self,
                          collection: str,
                          query_vector: List[float],
                          text_query: str,
                          top_k: int = 10,
                          alpha: float = 0.5) -> List[Dict[str, Any]]:
        """Perform hybrid vector + text search"""
        return await self.client.hybrid_search(collection, query_vector, text_query, top_k, alpha)

class ChromaDBAdapter:
    def __init__(self, config: Dict[str, Any]):
        self.client = chromadb.Client(Settings(
            chroma_db_impl="duckdb+parquet",
            persist_directory=config.get("persist_directory", "./chroma_db")
        ))
    
    async def create_collection(self, name: str, dimension: int, distance_metric: str) -> bool:
        """Create ChromaDB collection"""
        try:
            collection = self.client.create_collection(
                name=name,
                metadata={"dimension": dimension, "distance": distance_metric}
            )
            return True
        except Exception as e:
            print(f"Error creating collection: {e}")
            return False
    
    async def upsert_documents(self, collection: str, documents: List[Dict[str, Any]]) -> List[str]:
        """Upsert documents to ChromaDB"""
        coll = self.client.get_collection(collection)
        
        ids = [doc["id"] for doc in documents]
        embeddings = [doc["embedding"] for doc in documents]
        metadatas = [doc["metadata"] for doc in documents]
        documents_text = [doc["content"] for doc in documents]
        
        coll.upsert(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents_text
        )
        
        return ids
    
    async def search(self,
                    collection: str,
                    query_vector: List[float],
                    top_k: int,
                    filters: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Search ChromaDB collection"""
        coll = self.client.get_collection(collection)
        
        results = coll.query(
            query_embeddings=[query_vector],
            n_results=top_k,
            where=filters
        )
        
        search_results = []
        for i in range(len(results['ids'][0])):
            search_results.append({
                'id': results['ids'][0][i],
                'content': results['documents'][0][i],
                'metadata': results['metadatas'][0][i],
                'score': results['distances'][0][i]
            })
        
        return search_results

class QdrantAdapter:
    def __init__(self, config: Dict[str, Any]):
        self.client = QdrantClient(
            host=config.get("host", "localhost"),
            port=config.get("port", 6333),
            api_key=config.get("api_key")
        )
    
    async def create_collection(self, name: str, dimension: int, distance_metric: str) -> bool:
        """Create Qdrant collection"""
        try:
            distance_map = {
                "cosine": Distance.COSINE,
                "euclidean": Distance.EUCLID,
                "dot": Distance.DOT
            }
            
            self.client.recreate_collection(
                collection_name=name,
                vectors_config=VectorParams(
                    size=dimension,
                    distance=distance_map.get(distance_metric, Distance.COSINE)
                )
            )
            return True
        except Exception as e:
            print(f"Error creating collection: {e}")
            return False
    
    async def upsert_documents(self, collection: str, documents: List[Dict[str, Any]]) -> List[str]:
        """Upsert documents to Qdrant"""
        from qdrant_client.models import PointStruct
        
        points = []
        for doc in documents:
            points.append(PointStruct(
                id=doc["id"],
                vector=doc["embedding"],
                payload={
                    "content": doc["content"],
                    **doc["metadata"]
                }
            ))
        
        self.client.upsert(
            collection_name=collection,
            points=points
        )
        
        return [doc["id"] for doc in documents]
```

### Week 2: Enhanced Retrieval

**Day 1-2: Semantic Search Enhancement**
```python
# services/retriever/src/enhanced_search.py
from typing import List, Dict, Any, Optional
import asyncio
from dataclasses import dataclass
from datetime import datetime

@dataclass
class SearchQuery:
    text: str
    filters: Optional[Dict[str, Any]] = None
    domain: Optional[str] = None
    user_context: Optional[Dict[str, Any]] = None
    max_results: int = 10
    min_score: float = 0.0

@dataclass
class SearchResult:
    id: str
    content: str
    metadata: Dict[str, Any]
    score: float
    explanation: str
    source: str

class EnhancedRetriever:
    def __init__(self, 
                 vector_store: UnifiedVectorStore,
                 graph_store: KnowledgeGraph,
                 embedding_service: EmbeddingService):
        self.vector_store = vector_store
        self.graph_store = graph_store
        self.embedding_service = embedding_service
        self.query_rewriter = QueryRewriter()
        self.result_ranker = ResultRanker()
        self.context_enhancer = ContextEnhancer()
    
    async def search(self, query: SearchQuery) -> List[SearchResult]:
        """Enhanced semantic search with multiple strategies"""
        
        # 1. Query expansion and rewriting
        expanded_queries = await self.query_rewriter.expand(query)
        
        # 2. Multi-strategy retrieval
        retrieval_tasks = [
            self._vector_search(query),
            self._graph_search(query),
            self._hybrid_search(query),
        ]
        
        if expanded_queries:
            for expanded_query in expanded_queries:
                retrieval_tasks.append(self._vector_search(expanded_query))
        
        # 3. Execute searches concurrently
        search_results = await asyncio.gather(*retrieval_tasks, return_exceptions=True)
        
        # 4. Merge and deduplicate results
        merged_results = await self._merge_results(search_results)
        
        # 5. Re-rank based on context and relevance
        ranked_results = await self.result_ranker.rank(merged_results, query)
        
        # 6. Enhance with additional context
        enhanced_results = await self.context_enhancer.enhance(ranked_results, query)
        
        return enhanced_results[:query.max_results]
    
    async def _vector_search(self, query: SearchQuery) -> List[SearchResult]:
        """Pure vector similarity search"""
        # Generate query embedding
        query_embedding = await self.embedding_service.embed_text(query.text)
        
        # Determine collection based on domain
        collection = f"documents_{query.domain}" if query.domain else "documents_general"
        
        # Search vector store
        raw_results = await self.vector_store.search(
            collection=collection,
            query_vector=query_embedding,
            top_k=query.max_results * 2,  # Get more for reranking
            filters=query.filters
        )
        
        # Convert to SearchResult objects
        results = []
        for result in raw_results:
            if result['score'] >= query.min_score:
                results.append(SearchResult(
                    id=result['id'],
                    content=result['content'],
                    metadata=result['metadata'],
                    score=result['score'],
                    explanation=f"Vector similarity: {result['score']:.3f}",
                    source="vector_search"
                ))
        
        return results
    
    async def _graph_search(self, query: SearchQuery) -> List[SearchResult]:
        """Graph-based conceptual search"""
        # Extract key concepts from query
        concepts = await self._extract_query_concepts(query.text)
        
        # Find related concepts in knowledge graph
        related_concepts = []
        for concept in concepts:
            related = await self.graph_store.query_related_concepts(
                concept=concept,
                max_depth=2
            )
            related_concepts.extend(related)
        
        # Find documents containing these concepts
        concept_queries = [concept.name for concept in related_concepts]
        
        results = []
        for concept_query in concept_queries:
            concept_embedding = await self.embedding_service.embed_text(concept_query)
            
            raw_results = await self.vector_store.search(
                collection="documents_general",
                query_vector=concept_embedding,
                top_k=5,
                filters=query.filters
            )
            
            for result in raw_results:
                results.append(SearchResult(
                    id=result['id'],
                    content=result['content'],
                    metadata=result['metadata'],
                    score=result['score'] * 0.9,  # Slight penalty for indirect match
                    explanation=f"Related concept: {concept_query}",
                    source="graph_search"
                ))
        
        return results
    
    async def _hybrid_search(self, query: SearchQuery) -> List[SearchResult]:
        """Combine vector search with keyword search"""
        # Extract keywords from query
        keywords = await self._extract_keywords(query.text)
        
        # Generate query embedding
        query_embedding = await self.embedding_service.embed_text(query.text)
        
        # Perform hybrid search
        collection = f"documents_{query.domain}" if query.domain else "documents_general"
        
        raw_results = await self.vector_store.hybrid_search(
            collection=collection,
            query_vector=query_embedding,
            text_query=" ".join(keywords),
            top_k=query.max_results,
            alpha=0.7  # Weight towards vector search
        )
        
        results = []
        for result in raw_results:
            results.append(SearchResult(
                id=result['id'],
                content=result['content'],
                metadata=result['metadata'],
                score=result['score'],
                explanation=f"Hybrid search: vector + keywords",
                source="hybrid_search"
            ))
        
        return results

class QueryRewriter:
    """Expand and rewrite queries for better retrieval"""
    
    def __init__(self):
        self.synonyms_db = SynonymsDatabase()
        self.domain_expander = DomainSpecificExpander()
    
    async def expand(self, query: SearchQuery) -> List[SearchQuery]:
        """Generate multiple query variations"""
        expansions = []
        
        # Synonym expansion
        synonym_query = await self._expand_synonyms(query)
        if synonym_query.text != query.text:
            expansions.append(synonym_query)
        
        # Domain-specific expansion
        if query.domain:
            domain_query = await self.domain_expander.expand(query)
            if domain_query:
                expansions.append(domain_query)
        
        # Question to statement conversion
        statement_query = await self._question_to_statement(query)
        if statement_query:
            expansions.append(statement_query)
        
        return expansions
    
    async def _expand_synonyms(self, query: SearchQuery) -> SearchQuery:
        """Expand query with synonyms"""
        words = query.text.split()
        expanded_words = []
        
        for word in words:
            synonyms = await self.synonyms_db.get_synonyms(word)
            if synonyms:
                expanded_words.extend([word] + synonyms[:2])  # Add top 2 synonyms
            else:
                expanded_words.append(word)
        
        expanded_text = " ".join(expanded_words)
        return SearchQuery(
            text=expanded_text,
            filters=query.filters,
            domain=query.domain,
            user_context=query.user_context,
            max_results=query.max_results,
            min_score=query.min_score
        )

class ResultRanker:
    """Advanced result ranking and relevance scoring"""
    
    def __init__(self):
        self.diversity_scorer = DiversityScorer()
        self.freshness_scorer = FreshnessScorer()
        self.authority_scorer = AuthorityScorer()
    
    async def rank(self, results: List[SearchResult], query: SearchQuery) -> List[SearchResult]:
        """Re-rank results based on multiple factors"""
        if not results:
            return results
        
        # Calculate additional scores
        for result in results:
            # Diversity score
            result.diversity_score = await self.diversity_scorer.score(result, results)
            
            # Freshness score
            result.freshness_score = await self.freshness_scorer.score(result)
            
            # Authority score
            result.authority_score = await self.authority_scorer.score(result)
            
            # User context relevance
            result.context_score = await self._calculate_context_score(result, query)
            
            # Combined score
            result.final_score = self._combine_scores(result)
        
        # Sort by final score
        return sorted(results, key=lambda r: r.final_score, reverse=True)
    
    def _combine_scores(self, result: SearchResult) -> float:
        """Combine multiple scoring factors"""
        weights = {
            'semantic': 0.4,
            'diversity': 0.2,
            'freshness': 0.2,
            'authority': 0.1,
            'context': 0.1
        }
        
        return (
            result.score * weights['semantic'] +
            getattr(result, 'diversity_score', 0) * weights['diversity'] +
            getattr(result, 'freshness_score', 0) * weights['freshness'] +
            getattr(result, 'authority_score', 0) * weights['authority'] +
            getattr(result, 'context_score', 0) * weights['context']
        )
```

**Day 3-4: Context Enhancement**
```python
# services/retriever/src/context_enhancer.py
class ContextEnhancer:
    """Enhance search results with additional context"""
    
    def __init__(self, 
                 graph_store: KnowledgeGraph,
                 embedding_service: EmbeddingService):
        self.graph_store = graph_store
        self.embedding_service = embedding_service
    
    async def enhance(self, 
                     results: List[SearchResult], 
                     query: SearchQuery) -> List[SearchResult]:
        """Add relevant context to search results"""
        enhanced_results = []
        
        for result in results:
            # Add related documents
            related_docs = await self._find_related_documents(result, query)
            
            # Add concept explanations
            concepts = await self._extract_key_concepts(result.content)
            concept_explanations = await self._get_concept_explanations(concepts)
            
            # Add cross-references
            cross_refs = await self._find_cross_references(result)
            
            # Create enhanced result
            enhanced_result = SearchResult(
                id=result.id,
                content=result.content,
                metadata={
                    **result.metadata,
                    'related_documents': related_docs,
                    'concept_explanations': concept_explanations,
                    'cross_references': cross_refs,
                    'enhancement_timestamp': datetime.now().isoformat()
                },
                score=result.score,
                explanation=result.explanation,
                source=result.source
            )
            
            enhanced_results.append(enhanced_result)
        
        return enhanced_results
    
    async def _find_related_documents(self, 
                                    result: SearchResult, 
                                    query: SearchQuery) -> List[Dict[str, Any]]:
        """Find documents related to the current result"""
        # Extract key terms from the result
        key_terms = await self._extract_key_terms(result.content)
        
        related_docs = []
        for term in key_terms[:5]:  # Limit to top 5 terms
            term_embedding = await self.embedding_service.embed_text(term)
            
            similar_docs = await self.vector_store.search(
                collection="documents_general",
                query_vector=term_embedding,
                top_k=3,
                filters={'id': {'$ne': result.id}}  # Exclude current document
            )
            
            for doc in similar_docs:
                related_docs.append({
                    'id': doc['id'],
                    'title': doc['metadata'].get('title', 'Untitled'),
                    'relevance_term': term,
                    'score': doc['score']
                })
        
        # Deduplicate and sort by score
        unique_docs = {}
        for doc in related_docs:
            if doc['id'] not in unique_docs or doc['score'] > unique_docs[doc['id']]['score']:
                unique_docs[doc['id']] = doc
        
        return sorted(unique_docs.values(), key=lambda x: x['score'], reverse=True)[:5]
    
    async def _get_concept_explanations(self, concepts: List[str]) -> Dict[str, str]:
        """Get explanations for key concepts"""
        explanations = {}
        
        for concept in concepts:
            # Look up concept in knowledge graph
            concept_info = await self.graph_store.get_concept_definition(concept)
            if concept_info:
                explanations[concept] = concept_info.definition
            else:
                # Try to find explanation in documents
                concept_embedding = await self.embedding_service.embed_text(f"what is {concept}")
                
                definition_results = await self.vector_store.search(
                    collection="definitions",
                    query_vector=concept_embedding,
                    top_k=1,
                    filters={'concept': concept}
                )
                
                if definition_results:
                    explanations[concept] = definition_results[0]['content']
        
        return explanations
    
    async def _find_cross_references(self, result: SearchResult) -> List[Dict[str, Any]]:
        """Find cross-references and citations"""
        cross_refs = []
        
        # Extract entities that might have references
        entities = await self._extract_entities(result.content)
        
        for entity in entities:
            # Find documents that reference this entity
            references = await self.graph_store.find_entity_references(entity)
            
            for ref in references:
                cross_refs.append({
                    'entity': entity,
                    'referenced_in': ref.document_id,
                    'context': ref.context,
                    'relationship_type': ref.relationship_type
                })
        
        return cross_refs[:10]  # Limit to top 10 cross-references
```

**Day 5: Knowledge Graph Construction**
```python
# services/knowledge-ingestion/src/indexing/graph_builder.py
import networkx as nx
from typing import List, Dict, Any, Tuple
import asyncio
from dataclasses import dataclass

@dataclass
class GraphNode:
    id: str
    type: str
    properties: Dict[str, Any]
    
@dataclass
class GraphEdge:
    source: str
    target: str
    relationship: str
    properties: Dict[str, Any]

class KnowledgeGraphBuilder:
    def __init__(self, neo4j_client):
        self.neo4j = neo4j_client
        self.entity_resolver = EntityResolver()
        self.relationship_validator = RelationshipValidator()
        self.schema_manager = SchemaManager()
    
    async def build_from_documents(self, documents: List[ProcessedDocument]) -> bool:
        """Build knowledge graph from processed documents"""
        try:
            # 1. Extract and resolve entities
            all_entities = await self._extract_all_entities(documents)
            resolved_entities = await self.entity_resolver.resolve(all_entities)
            
            # 2. Create entity nodes
            await self._create_entity_nodes(resolved_entities)
            
            # 3. Extract and validate relationships
            all_relationships = await self._extract_all_relationships(documents)
            validated_relationships = await self.relationship_validator.validate(all_relationships)
            
            # 4. Create relationship edges
            await self._create_relationship_edges(validated_relationships)
            
            # 5. Create document nodes and connections
            await self._create_document_nodes(documents)
            
            # 6. Build derived relationships
            await self._build_derived_relationships()
            
            return True
            
        except Exception as e:
            print(f"Error building knowledge graph: {e}")
            return False
    
    async def _extract_all_entities(self, documents: List[ProcessedDocument]) -> List[Dict[str, Any]]:
        """Extract entities from all documents"""
        all_entities = []
        
        for doc in documents:
            for entity in doc.entities:
                all_entities.append({
                    'text': entity['text'],
                    'type': entity['label'],
                    'document_id': doc.id,
                    'confidence': entity.get('confidence', 1.0),
                    'context': self._get_entity_context(entity, doc.content)
                })
        
        return all_entities
    
    async def _create_entity_nodes(self, entities: List[Dict[str, Any]]) -> None:
        """Create entity nodes in Neo4j"""
        session = self.neo4j.driver.session()
        
        try:
            for entity in entities:
                # Create or update entity node
                query = """
                MERGE (e:Entity {name: $name, type: $type})
                ON CREATE SET 
                    e.created_at = datetime(),
                    e.confidence = $confidence,
                    e.contexts = [$context]
                ON MATCH SET 
                    e.confidence = CASE 
                        WHEN $confidence > e.confidence THEN $confidence 
                        ELSE e.confidence 
                    END,
                    e.contexts = e.contexts + [$context]
                RETURN e
                """
                
                await session.run(query, {
                    'name': entity['text'],
                    'type': entity['type'],
                    'confidence': entity['confidence'],
                    'context': entity['context']
                })
                
        finally:
            await session.close()
    
    async def _create_relationship_edges(self, relationships: List[Dict[str, Any]]) -> None:
        """Create relationship edges in Neo4j"""
        session = self.neo4j.driver.session()
        
        try:
            for rel in relationships:
                # Create relationship between entities
                query = """
                MATCH (source:Entity {name: $source_name})
                MATCH (target:Entity {name: $target_name})
                MERGE (source)-[r:RELATED {type: $rel_type}]->(target)
                ON CREATE SET 
                    r.created_at = datetime(),
                    r.confidence = $confidence,
                    r.contexts = [$context]
                ON MATCH SET 
                    r.confidence = CASE 
                        WHEN $confidence > r.confidence THEN $confidence 
                        ELSE r.confidence 
                    END,
                    r.contexts = r.contexts + [$context]
                RETURN r
                """
                
                await session.run(query, {
                    'source_name': rel['subject'],
                    'target_name': rel['object'],
                    'rel_type': rel['predicate'],
                    'confidence': rel['confidence'],
                    'context': rel.get('context', '')
                })
                
        finally:
            await session.close()
    
    async def _build_derived_relationships(self) -> None:
        """Build derived relationships through graph analysis"""
        session = self.neo4j.driver.session()
        
        try:
            # Co-occurrence relationships
            cooccurrence_query = """
            MATCH (e1:Entity)-[:MENTIONED_IN]->(d:Document)<-[:MENTIONED_IN]-(e2:Entity)
            WHERE e1 <> e2 AND NOT (e1)-[:RELATED]-(e2)
            WITH e1, e2, count(d) as cooccurrence_count
            WHERE cooccurrence_count >= 3
            MERGE (e1)-[r:RELATED {type: 'co_occurs'}]->(e2)
            SET r.strength = cooccurrence_count,
                r.derived = true,
                r.created_at = datetime()
            """
            
            await session.run(cooccurrence_query)
            
            # Hierarchical relationships (based on naming patterns)
            hierarchy_query = """
            MATCH (parent:Entity), (child:Entity)
            WHERE child.name STARTS WITH parent.name + '.'
               OR child.name STARTS WITH parent.name + '::'
               OR child.name STARTS WITH parent.name + '/'
            AND NOT (parent)-[:RELATED {type: 'contains'}]->(child)
            MERGE (parent)-[r:RELATED {type: 'contains'}]->(child)
            SET r.derived = true,
                r.created_at = datetime()
            """
            
            await session.run(hierarchy_query)
            
        finally:
            await session.close()

class EntityResolver:
    """Resolve entity mentions to canonical entities"""
    
    def __init__(self):
        self.alias_db = AliasDatabase()
        self.similarity_threshold = 0.85
    
    async def resolve(self, entities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Resolve entities to canonical forms"""
        resolved_entities = []
        entity_clusters = await self._cluster_similar_entities(entities)
        
        for cluster in entity_clusters:
            canonical_entity = await self._select_canonical_entity(cluster)
            resolved_entities.append(canonical_entity)
        
        return resolved_entities
    
    async def _cluster_similar_entities(self, entities: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        """Cluster similar entity mentions"""
        # Simple clustering based on string similarity
        clusters = []
        used_entities = set()
        
        for i, entity in enumerate(entities):
            if i in used_entities:
                continue
                
            cluster = [entity]
            used_entities.add(i)
            
            for j, other_entity in enumerate(entities[i+1:], i+1):
                if j in used_entities:
                    continue
                    
                similarity = self._calculate_similarity(entity['text'], other_entity['text'])
                if similarity >= self.similarity_threshold:
                    cluster.append(other_entity)
                    used_entities.add(j)
            
            clusters.append(cluster)
        
        return clusters
    
    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate similarity between two entity mentions"""
        from difflib import SequenceMatcher
        return SequenceMatcher(None, text1.lower(), text2.lower()).ratio()
    
    async def _select_canonical_entity(self, cluster: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Select the canonical entity from a cluster"""
        # Prefer entities with higher confidence
        cluster.sort(key=lambda e: e['confidence'], reverse=True)
        
        canonical = cluster[0].copy()
        
        # Merge contexts from all entities in cluster
        all_contexts = []
        for entity in cluster:
            all_contexts.append(entity['context'])
        
        canonical['contexts'] = all_contexts
        canonical['aliases'] = [e['text'] for e in cluster[1:]]
        
        return canonical
```

### Week 3: Production Integration

**Day 1-2: Pipeline Orchestration**
```python
# services/knowledge-ingestion/src/pipeline/orchestrator.py
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import json
from dataclasses import dataclass, asdict
from enum import Enum

class PipelineStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class PipelineJob:
    id: str
    type: str
    config: Dict[str, Any]
    status: PipelineStatus
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    progress: float = 0.0
    error_message: Optional[str] = None
    results: Dict[str, Any] = None

class IngestionOrchestrator:
    def __init__(self, 
                 vector_store: UnifiedVectorStore,
                 graph_store: KnowledgeGraph,
                 embedding_service: EmbeddingService):
        self.vector_store = vector_store
        self.graph_store = graph_store
        self.embedding_service = embedding_service
        
        self.document_processor = DocumentProcessor()
        self.graph_builder = KnowledgeGraphBuilder(graph_store)
        self.job_queue = asyncio.Queue()
        self.active_jobs = {}
        self.job_history = []
        
        # Start background worker
        asyncio.create_task(self._job_worker())
    
    async def ingest_documents(self, 
                             file_paths: List[str],
                             collection: str = "documents_general",
                             domain: Optional[str] = None) -> str:
        """Queue document ingestion job"""
        job = PipelineJob(
            id=self._generate_job_id(),
            type="document_ingestion",
            config={
                "file_paths": file_paths,
                "collection": collection,
                "domain": domain
            },
            status=PipelineStatus.PENDING,
            created_at=datetime.now()
        )
        
        await self.job_queue.put(job)
        self.active_jobs[job.id] = job
        
        return job.id
    
    async def ingest_from_source(self,
                               source_type: str,
                               source_config: Dict[str, Any],
                               collection: str = "documents_general") -> str:
        """Queue ingestion from external source"""
        job = PipelineJob(
            id=self._generate_job_id(),
            type="source_ingestion",
            config={
                "source_type": source_type,
                "source_config": source_config,
                "collection": collection
            },
            status=PipelineStatus.PENDING,
            created_at=datetime.now()
        )
        
        await self.job_queue.put(job)
        self.active_jobs[job.id] = job
        
        return job.id
    
    async def rebuild_graph(self) -> str:
        """Queue knowledge graph rebuild"""
        job = PipelineJob(
            id=self._generate_job_id(),
            type="graph_rebuild",
            config={},
            status=PipelineStatus.PENDING,
            created_at=datetime.now()
        )
        
        await self.job_queue.put(job)
        self.active_jobs[job.id] = job
        
        return job.id
    
    async def get_job_status(self, job_id: str) -> Optional[PipelineJob]:
        """Get status of a specific job"""
        return self.active_jobs.get(job_id)
    
    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a running job"""
        if job_id in self.active_jobs:
            job = self.active_jobs[job_id]
            if job.status == PipelineStatus.RUNNING:
                job.status = PipelineStatus.CANCELLED
                return True
        return False
    
    async def _job_worker(self):
        """Background worker to process jobs"""
        while True:
            try:
                job = await self.job_queue.get()
                
                if job.status == PipelineStatus.CANCELLED:
                    continue
                
                # Start job execution
                job.status = PipelineStatus.RUNNING
                job.started_at = datetime.now()
                
                try:
                    if job.type == "document_ingestion":
                        await self._execute_document_ingestion(job)
                    elif job.type == "source_ingestion":
                        await self._execute_source_ingestion(job)
                    elif job.type == "graph_rebuild":
                        await self._execute_graph_rebuild(job)
                    
                    job.status = PipelineStatus.COMPLETED
                    job.completed_at = datetime.now()
                    
                except Exception as e:
                    job.status = PipelineStatus.FAILED
                    job.error_message = str(e)
                    job.completed_at = datetime.now()
                
                # Move to history
                self.job_history.append(job)
                if job.id in self.active_jobs:
                    del self.active_jobs[job.id]
                
                # Cleanup old history
                self._cleanup_job_history()
                
            except Exception as e:
                print(f"Error in job worker: {e}")
    
    async def _execute_document_ingestion(self, job: PipelineJob):
        """Execute document ingestion job"""
        file_paths = job.config["file_paths"]
        collection = job.config["collection"]
        domain = job.config.get("domain")
        
        total_files = len(file_paths)
        processed_files = 0
        
        # Process documents in batches
        batch_size = 5
        for i in range(0, total_files, batch_size):
            batch_paths = file_paths[i:i + batch_size]
            
            # Process batch
            processed_docs = await self.document_processor.process_batch(
                [Path(path) for path in batch_paths]
            )
            
            # Filter out failed processing
            valid_docs = [doc for doc in processed_docs if isinstance(doc, ProcessedDocument)]
            
            if valid_docs:
                # Generate embeddings
                await self._generate_embeddings(valid_docs)
                
                # Store in vector database
                await self._store_documents(valid_docs, collection)
                
                # Update knowledge graph
                await self.graph_builder.build_from_documents(valid_docs)
            
            processed_files += len(batch_paths)
            job.progress = processed_files / total_files
        
        job.results = {
            "total_files": total_files,
            "processed_files": processed_files,
            "collection": collection
        }
    
    async def _generate_embeddings(self, documents: List[ProcessedDocument]):
        """Generate embeddings for document chunks"""
        for doc in documents:
            # Generate embeddings for chunks
            chunk_embeddings = []
            for chunk in doc.chunks:
                embedding = await self.embedding_service.embed_text(chunk)
                chunk_embeddings.append(embedding)
            
            # Store embeddings in document
            doc.embeddings = chunk_embeddings
    
    async def _store_documents(self, documents: List[ProcessedDocument], collection: str):
        """Store documents in vector database"""
        vector_docs = []
        
        for doc in documents:
            for i, (chunk, embedding) in enumerate(zip(doc.chunks, doc.embeddings)):
                vector_docs.append({
                    "id": f"{doc.id}_chunk_{i}",
                    "content": chunk,
                    "embedding": embedding,
                    "metadata": {
                        **doc.metadata,
                        "document_id": doc.id,
                        "chunk_index": i,
                        "chunk_count": len(doc.chunks)
                    }
                })
        
        await self.vector_store.upsert_documents(collection, vector_docs)

# External source crawlers
class SourceCrawler:
    """Base class for external source crawlers"""
    
    async def crawl(self, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Crawl external source and return documents"""
        raise NotImplementedError

class GitHubCrawler(SourceCrawler):
    async def crawl(self, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Crawl GitHub repository"""
        repo_url = config["repo_url"]
        file_patterns = config.get("file_patterns", ["*.md", "*.py", "*.js"])
        
        # Implementation to crawl GitHub repo
        # This would use GitHub API to fetch files
        documents = []
        
        # Placeholder implementation
        return documents

class ConfluenceCrawler(SourceCrawler):
    async def crawl(self, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Crawl Confluence space"""
        base_url = config["base_url"]
        space_key = config["space_key"]
        auth = config["auth"]
        
        # Implementation to crawl Confluence
        documents = []
        
        return documents
```

**Day 3-4: Monitoring and Health Checks**
```python
# services/knowledge-ingestion/src/monitoring/health_monitor.py
from typing import Dict, Any, List
import asyncio
from datetime import datetime, timedelta
from dataclasses import dataclass

@dataclass
class HealthStatus:
    service: str
    status: str  # healthy, degraded, unhealthy
    message: str
    timestamp: datetime
    metrics: Dict[str, Any]

class RAGHealthMonitor:
    def __init__(self,
                 vector_store: UnifiedVectorStore,
                 graph_store: KnowledgeGraph,
                 embedding_service: EmbeddingService):
        self.vector_store = vector_store
        self.graph_store = graph_store
        self.embedding_service = embedding_service
        self.health_history = []
        
    async def check_overall_health(self) -> Dict[str, HealthStatus]:
        """Check health of all RAG components"""
        health_checks = {
            "vector_store": self._check_vector_store_health(),
            "graph_store": self._check_graph_store_health(),
            "embedding_service": self._check_embedding_service_health(),
            "ingestion_pipeline": self._check_ingestion_pipeline_health(),
        }
        
        results = {}
        for service, check_coro in health_checks.items():
            try:
                results[service] = await asyncio.wait_for(check_coro, timeout=30)
            except asyncio.TimeoutError:
                results[service] = HealthStatus(
                    service=service,
                    status="unhealthy",
                    message="Health check timed out",
                    timestamp=datetime.now(),
                    metrics={}
                )
            except Exception as e:
                results[service] = HealthStatus(
                    service=service,
                    status="unhealthy",
                    message=f"Health check failed: {e}",
                    timestamp=datetime.now(),
                    metrics={}
                )
        
        # Store health history
        self.health_history.append({
            "timestamp": datetime.now(),
            "results": results
        })
        
        # Cleanup old history (keep last 24 hours)
        cutoff = datetime.now() - timedelta(hours=24)
        self.health_history = [
            h for h in self.health_history 
            if h["timestamp"] > cutoff
        ]
        
        return results
    
    async def _check_vector_store_health(self) -> HealthStatus:
        """Check vector store health"""
        try:
            # Test basic operations
            test_vector = [0.1] * 1536  # Standard embedding dimension
            
            # Test search
            search_results = await self.vector_store.search(
                collection="documents_general",
                query_vector=test_vector,
                top_k=1
            )
            
            # Get collection stats
            collections = await self.vector_store.list_collections()
            total_documents = 0
            
            for collection in collections:
                stats = await self.vector_store.get_collection_stats(collection)
                total_documents += stats.get("document_count", 0)
            
            metrics = {
                "collections": len(collections),
                "total_documents": total_documents,
                "search_latency_ms": 0,  # Would measure actual latency
            }
            
            if total_documents == 0:
                return HealthStatus(
                    service="vector_store",
                    status="degraded",
                    message="No documents indexed",
                    timestamp=datetime.now(),
                    metrics=metrics
                )
            
            return HealthStatus(
                service="vector_store",
                status="healthy",
                message="Vector store operational",
                timestamp=datetime.now(),
                metrics=metrics
            )
            
        except Exception as e:
            return HealthStatus(
                service="vector_store",
                status="unhealthy",
                message=f"Vector store error: {e}",
                timestamp=datetime.now(),
                metrics={}
            )
    
    async def _check_graph_store_health(self) -> HealthStatus:
        """Check knowledge graph health"""
        try:
            # Test Neo4j connection
            session = self.graph_store.driver.session()
            
            # Get basic stats
            result = await session.run("""
                MATCH (n)
                RETURN 
                    count(n) as node_count,
                    count{(n)-[]->()} as relationship_count
            """)
            
            record = await result.single()
            node_count = record["node_count"]
            relationship_count = record["relationship_count"]
            
            await session.close()
            
            metrics = {
                "node_count": node_count,
                "relationship_count": relationship_count,
                "connection_status": "connected"
            }
            
            if node_count == 0:
                return HealthStatus(
                    service="graph_store",
                    status="degraded",
                    message="Knowledge graph is empty",
                    timestamp=datetime.now(),
                    metrics=metrics
                )
            
            return HealthStatus(
                service="graph_store",
                status="healthy",
                message="Knowledge graph operational",
                timestamp=datetime.now(),
                metrics=metrics
            )
            
        except Exception as e:
            return HealthStatus(
                service="graph_store",
                status="unhealthy",
                message=f"Graph store error: {e}",
                timestamp=datetime.now(),
                metrics={}
            )
    
    async def _check_embedding_service_health(self) -> HealthStatus:
        """Check embedding service health"""
        try:
            # Test embedding generation
            test_text = "This is a test for the embedding service health check."
            
            start_time = datetime.now()
            embedding = await self.embedding_service.embed_text(test_text)
            end_time = datetime.now()
            
            latency_ms = (end_time - start_time).total_seconds() * 1000
            
            metrics = {
                "embedding_dimension": len(embedding),
                "latency_ms": latency_ms,
                "model_status": "operational"
            }
            
            if latency_ms > 5000:  # 5 seconds threshold
                return HealthStatus(
                    service="embedding_service",
                    status="degraded",
                    message="High embedding latency",
                    timestamp=datetime.now(),
                    metrics=metrics
                )
            
            return HealthStatus(
                service="embedding_service",
                status="healthy",
                message="Embedding service operational",
                timestamp=datetime.now(),
                metrics=metrics
            )
            
        except Exception as e:
            return HealthStatus(
                service="embedding_service",
                status="unhealthy",
                message=f"Embedding service error: {e}",
                timestamp=datetime.now(),
                metrics={}
            )
    
    async def get_health_trends(self, hours: int = 24) -> Dict[str, Any]:
        """Get health trends over time"""
        cutoff = datetime.now() - timedelta(hours=hours)
        relevant_history = [
            h for h in self.health_history
            if h["timestamp"] > cutoff
        ]
        
        if not relevant_history:
            return {"error": "No health data available"}
        
        trends = {}
        services = ["vector_store", "graph_store", "embedding_service", "ingestion_pipeline"]
        
        for service in services:
            service_data = []
            for history_point in relevant_history:
                if service in history_point["results"]:
                    status = history_point["results"][service]
                    service_data.append({
                        "timestamp": history_point["timestamp"],
                        "status": status.status,
                        "metrics": status.metrics
                    })
            
            trends[service] = {
                "data_points": len(service_data),
                "uptime_percentage": self._calculate_uptime(service_data),
                "recent_status": service_data[-1]["status"] if service_data else "unknown",
                "trend_data": service_data[-20:]  # Last 20 data points
            }
        
        return trends
    
    def _calculate_uptime(self, service_data: List[Dict[str, Any]]) -> float:
        """Calculate uptime percentage"""
        if not service_data:
            return 0.0
        
        healthy_count = sum(1 for d in service_data if d["status"] == "healthy")
        return (healthy_count / len(service_data)) * 100
```

**Day 5: API Integration**
```python
# services/retriever/main.py - Enhanced with new capabilities
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import asyncio

app = FastAPI(title="Enhanced RAG Retriever", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize enhanced components
enhanced_retriever = EnhancedRetriever(
    vector_store=UnifiedVectorStore("chroma"),
    graph_store=KnowledgeGraph(os.getenv("NEO4J_URI"), {}),
    embedding_service=EmbeddingService()
)

health_monitor = RAGHealthMonitor(
    vector_store=enhanced_retriever.vector_store,
    graph_store=enhanced_retriever.graph_store,
    embedding_service=enhanced_retriever.embedding_service
)

ingestion_orchestrator = IngestionOrchestrator(
    vector_store=enhanced_retriever.vector_store,
    graph_store=enhanced_retriever.graph_store,
    embedding_service=enhanced_retriever.embedding_service
)

# Request/Response models
class SearchRequest(BaseModel):
    query: str
    filters: Optional[Dict[str, Any]] = None
    domain: Optional[str] = None
    max_results: int = 10
    min_score: float = 0.0
    include_context: bool = True

class SearchResponse(BaseModel):
    results: List[Dict[str, Any]]
    total_found: int
    search_time_ms: float
    query_expansion: Optional[List[str]] = None

class IngestionRequest(BaseModel):
    source_type: str  # "files", "github", "confluence", etc.
    source_config: Dict[str, Any]
    collection: str = "documents_general"
    domain: Optional[str] = None

class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: float
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error_message: Optional[str] = None
    results: Optional[Dict[str, Any]] = None

# API Endpoints
@app.get("/health")
async def health_check():
    """Basic health check"""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.get("/health/detailed")
async def detailed_health_check():
    """Detailed health check of all components"""
    health_results = await health_monitor.check_overall_health()
    
    overall_status = "healthy"
    if any(h.status == "unhealthy" for h in health_results.values()):
        overall_status = "unhealthy"
    elif any(h.status == "degraded" for h in health_results.values()):
        overall_status = "degraded"
    
    return {
        "overall_status": overall_status,
        "components": {
            service: {
                "status": health.status,
                "message": health.message,
                "metrics": health.metrics,
                "timestamp": health.timestamp.isoformat()
            }
            for service, health in health_results.items()
        }
    }

@app.post("/search", response_model=SearchResponse)
async def enhanced_search(request: SearchRequest):
    """Enhanced semantic search with context"""
    start_time = time.time()
    
    try:
        search_query = SearchQuery(
            text=request.query,
            filters=request.filters,
            domain=request.domain,
            max_results=request.max_results,
            min_score=request.min_score
        )
        
        results = await enhanced_retriever.search(search_query)
        
        search_time_ms = (time.time() - start_time) * 1000
        
        # Convert results to dict format
        result_dicts = []
        for result in results:
            result_dict = {
                "id": result.id,
                "content": result.content,
                "metadata": result.metadata,
                "score": result.score,
                "explanation": result.explanation,
                "source": result.source
            }
            
            if not request.include_context:
                # Remove context fields to reduce response size
                result_dict["metadata"] = {
                    k: v for k, v in result.metadata.items()
                    if k not in ["related_documents", "concept_explanations", "cross_references"]
                }
            
            result_dicts.append(result_dict)
        
        return SearchResponse(
            results=result_dicts,
            total_found=len(results),
            search_time_ms=search_time_ms
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")

@app.post("/ingest", response_model=Dict[str, str])
async def start_ingestion(request: IngestionRequest, background_tasks: BackgroundTasks):
    """Start document ingestion job"""
    try:
        if request.source_type == "files":
            job_id = await ingestion_orchestrator.ingest_documents(
                file_paths=request.source_config["file_paths"],
                collection=request.collection,
                domain=request.domain
            )
        else:
            job_id = await ingestion_orchestrator.ingest_from_source(
                source_type=request.source_type,
                source_config=request.source_config,
                collection=request.collection
            )
        
        return {"job_id": job_id, "message": "Ingestion job started"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start ingestion: {e}")

@app.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get status of ingestion job"""
    job = await ingestion_orchestrator.get_job_status(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return JobStatusResponse(
        job_id=job.id,
        status=job.status.value,
        progress=job.progress,
        created_at=job.created_at.isoformat(),
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        error_message=job.error_message,
        results=job.results
    )

@app.delete("/jobs/{job_id}")
async def cancel_job(job_id: str):
    """Cancel running job"""
    success = await ingestion_orchestrator.cancel_job(job_id)
    
    if not success:
        raise HTTPException(status_code=400, detail="Job cannot be cancelled")
    
    return {"message": "Job cancelled successfully"}

@app.get("/collections")
async def list_collections():
    """List available document collections"""
    collections = await enhanced_retriever.vector_store.list_collections()
    
    collection_info = []
    for collection in collections:
        stats = await enhanced_retriever.vector_store.get_collection_stats(collection)
        collection_info.append({
            "name": collection,
            "document_count": stats.get("document_count", 0),
            "last_updated": stats.get("last_updated")
        })
    
    return {"collections": collection_info}

@app.post("/collections/{collection_name}/rebuild")
async def rebuild_collection(collection_name: str):
    """Rebuild a specific collection"""
    job_id = await ingestion_orchestrator.rebuild_collection(collection_name)
    return {"job_id": job_id, "message": f"Collection {collection_name} rebuild started"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

## Success Criteria

### Functional Requirements
- ✅ Complete document ingestion pipeline with multiple format support
- ✅ Semantic search with context enhancement and query expansion
- ✅ Knowledge graph construction and relationship extraction
- ✅ Multi-modal search (vector, graph, hybrid)
- ✅ Real-time ingestion monitoring and health checks

### Performance Requirements
- ✅ Ingestion throughput: >1000 documents/hour
- ✅ Search latency: <500ms for semantic search
- ✅ Knowledge graph queries: <1s for relationship traversal
- ✅ Embedding generation: <100ms per document chunk
- ✅ Concurrent user support: 50+ simultaneous searches

### Quality Requirements
- ✅ Search relevance: >85% user satisfaction
- ✅ Knowledge extraction accuracy: >90% for entities
- ✅ Relationship extraction precision: >80%
- ✅ System uptime: 99.9% availability
- ✅ Data consistency across vector and graph stores

### Integration Requirements
- ✅ Agent specialization: Domain-specific knowledge routing
- ✅ Multi-source ingestion: Files, GitHub, Confluence, APIs
- ✅ Real-time updates: Incremental indexing and updates
- ✅ API compatibility: RESTful interface for all operations
- ✅ Monitoring integration: Comprehensive health and metrics

---

**Implementation Owner**: AI/ML Team + Backend Team  
**Estimated Effort**: 4-5 weeks  
**Dependencies**: Unified API Gateway, LLM Integration  
**Risk Level**: High (due to multi-system integration complexity)  
**Success Metrics**: <500ms search latency, >85% relevance, 99.9% uptime
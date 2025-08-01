import types
import sys
from fastapi.testclient import TestClient
import pytest

# ----- Stub heavy external dependencies to avoid full installation -----

sys.modules.setdefault("sentence_transformers", types.ModuleType("sentence_transformers"))
class _ST:
    def __init__(self, *_, **__):
        pass
    def get_sentence_embedding_dimension(self):
        return 3
    def encode(self, texts, convert_to_numpy=True):
        if isinstance(texts, list):
            return [[0.1, 0.2, 0.3] for _ in texts]
        return [0.1, 0.2, 0.3]

sys.modules["sentence_transformers"].SentenceTransformer = _ST

sys.modules.setdefault("torch", types.ModuleType("torch"))

qdrant_stub = types.ModuleType("qdrant_client")
class _DummyQdrant:
    def __init__(self, *_, **__):
        pass
    def get_collection(self, *_, **__):
        pass
    def recreate_collection(self, *_, **__):
        pass

qdrant_stub.QdrantClient = _DummyQdrant
qdrant_stub.models = types.SimpleNamespace(
    VectorParams=lambda *_, **__: None,
    Distance=types.SimpleNamespace(COSINE=None),
    PointStruct=lambda *_, **__: None,
)
sys.modules["qdrant_client"] = qdrant_stub

neo4j_stub = types.ModuleType("neo4j")
neo4j_stub.GraphDatabase = types.SimpleNamespace(driver=lambda *_, **__: None)
sys.modules["neo4j"] = neo4j_stub

prom_stub = types.ModuleType("prometheus_client")
prom_stub.Counter = lambda *_, **__: None
prom_stub.Histogram = lambda *_, **__: None
prom_stub.generate_latest = lambda *_, **__: b""
prom_stub.CONTENT_TYPE_LATEST = "text/plain"
sys.modules["prometheus_client"] = prom_stub

starlette_stub = types.ModuleType("starlette.responses")
starlette_stub.Response = type("_Response", (), {})
sys.modules["starlette.responses"] = starlette_stub

# Import service after patching external deps
import importlib


def _setup_stubs(monkeypatch):
    """Patch external dependencies in retriever.main."""
    import services.retriever.main as retriever

    # Stub qdrant client
    class _StubQdrant:
        def upsert(self, *_, **__):
            pass
        def search(self, *_, **__):
            class _DummyPoint:  # minimal object with payload
                def __init__(self, content):
                    self.payload = {"content": content}
            return [_DummyPoint("dummy result")]
    monkeypatch.setattr(retriever, "qdrant", _StubQdrant())

    # Stub Neo4j driver
    class _DummySession:
        def __enter__(self):
            return self
        def __exit__(self, exc_type, exc, tb):
            return False
        def run(self, query, **params):
            # Distinguish based on query content
            if "RETURN DISTINCT" in query:
                return [{"id": "mem2"}]
            return None
    class _DummyDriver:
        def session(self):
            return _DummySession()
    monkeypatch.setattr(retriever, "driver", _DummyDriver())

    # Patch embed to deterministic vector
    monkeypatch.setattr(retriever, "_embed", lambda text: [0.1, 0.2, 0.3])

    return retriever


def test_index_and_related(monkeypatch):
    retriever = _setup_stubs(monkeypatch)
    client = TestClient(retriever.app)

    # Index two memories with relationship
    res1 = client.post("/index", json={"id": "mem1", "content": "foo", "related_ids": ["mem2"]})
    assert res1.status_code == 200
    res2 = client.post("/index", json={"id": "mem2", "content": "bar"})
    assert res2.status_code == 200

    # Fetch related nodes
    rel = client.post("/related", json={"id": "mem1", "depth": 1})
    assert rel.status_code == 200
    data = rel.json()
    assert "related_ids" in data
    assert "mem2" in data["related_ids"] 
# Development Patterns

This file captures **canonical code patterns** used across AgentForge implementations (Python & TypeScript). These are *reference*, not rigid APIs.

---
## 1. Agent Factory
```python
class BaseAgent(ABC):
    # … see agentforge_core/agents/base.py
    pass

class AgentFactory:
    _registry: dict[str, type[BaseAgent]] = {}

    @classmethod
    def register(cls, kind: str):
        def _decorator(agent_cls):
            cls._registry[kind] = agent_cls
            return agent_cls
        return _decorator

    @classmethod
    def create(cls, kind: str, **cfg):
        if kind not in cls._registry:
            raise KeyError(f"Unknown agent kind: {kind}")
        return cls._registry[kind](**cfg)
```

## 2. Framework Router (Weighted-RT LB)
```python
class WeightedResponseTimeLB:
    def select(self, agents: list[AgentMetrics]) -> Agent:
        return min(agents, key=lambda a: a.avg_rt * a.current_load)
```

## 3. Circuit Breaker + ErrorGold
```python
async def safe_call(cb: CircuitBreaker, fn, *args, **kw):
    try:
        return await cb.call(fn, *args, **kw)
    except Exception as e:
        await ErrorGold.capture(e)  # polyglot SDK
        raise
```

## 4. Retriever Abstraction
```python
class RetrieverService:
    def __init__(self, vec, graph, cache):
        self.vec = vec; self.graph = graph; self.cache = cache

    async def search(self, query: str, k: int = 8):
        # vector search → ids
        ids = await self.vec.similarity_search(query, k=k)
        # fetch metadata from graph
        nodes = await self.graph.get_nodes(ids)
        # hydrate with cache
        return [self.cache.get(n.id) or n for n in nodes]
```

## 5. Adaptive Learning Loop
```python
if metrics.quality_score < THRESH:
    await PromptOptimizer.optimize(agent_id)
```

---
*Owner*: Framework Team – update when patterns evolve. 
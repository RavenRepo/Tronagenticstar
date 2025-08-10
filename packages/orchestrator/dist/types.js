// Unified task types across local TS agents and external Python microservices
export var TaskType;
(function (TaskType) {
    // Domain-level tasks
    TaskType["ARCHITECTURE"] = "ARCHITECTURE";
    TaskType["SECURITY"] = "SECURITY";
    TaskType["QUALITY"] = "QUALITY";
    TaskType["PERFORMANCE"] = "PERFORMANCE";
    TaskType["DEVOPS"] = "DEVOPS";
    // Action-level tasks (microservices)
    TaskType["CODE_GENERATION"] = "CODE_GENERATION";
    TaskType["REFACTOR"] = "REFACTOR";
    TaskType["EVALUATION"] = "EVALUATION";
    TaskType["DESIGN"] = "DESIGN";
    TaskType["EMBEDDING"] = "EMBEDDING";
    TaskType["PERFORMANCE_ANALYSIS"] = "PERFORMANCE_ANALYSIS";
    TaskType["COMPLIANCE"] = "COMPLIANCE";
    TaskType["RETRIEVAL"] = "RETRIEVAL";
})(TaskType || (TaskType = {}));
export var AgentStatus;
(function (AgentStatus) {
    AgentStatus["INITIALIZING"] = "initializing";
    AgentStatus["READY"] = "ready";
    AgentStatus["BUSY"] = "busy";
    AgentStatus["DEGRADED"] = "degraded";
    AgentStatus["UNAVAILABLE"] = "unavailable";
    AgentStatus["FAILED"] = "failed";
    AgentStatus["SHUTTING_DOWN"] = "shutting_down";
})(AgentStatus || (AgentStatus = {}));
export var CircuitBreakerState;
(function (CircuitBreakerState) {
    CircuitBreakerState["CLOSED"] = "closed";
    CircuitBreakerState["OPEN"] = "open";
    CircuitBreakerState["HALF_OPEN"] = "half_open";
})(CircuitBreakerState || (CircuitBreakerState = {}));

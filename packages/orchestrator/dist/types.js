export var TaskType;
(function (TaskType) {
    TaskType["ARCHITECTURE"] = "ARCHITECTURE";
    TaskType["SECURITY"] = "SECURITY";
    TaskType["QUALITY"] = "QUALITY";
    TaskType["PERFORMANCE"] = "PERFORMANCE";
    TaskType["DEVOPS"] = "DEVOPS";
})(TaskType || (TaskType = {}));
export var AgentStatus;
(function (AgentStatus) {
    AgentStatus["INITIALIZING"] = "initializing";
    AgentStatus["READY"] = "ready";
    AgentStatus["BUSY"] = "busy";
    AgentStatus["DEGRADED"] = "degraded";
    AgentStatus["FAILED"] = "failed";
    AgentStatus["SHUTTING_DOWN"] = "shutting_down";
})(AgentStatus || (AgentStatus = {}));
export var CircuitBreakerState;
(function (CircuitBreakerState) {
    CircuitBreakerState["CLOSED"] = "closed";
    CircuitBreakerState["OPEN"] = "open";
    CircuitBreakerState["HALF_OPEN"] = "half_open";
})(CircuitBreakerState || (CircuitBreakerState = {}));

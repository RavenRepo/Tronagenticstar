import { EventEmitter } from "eventemitter3";
export class BaseAgent extends EventEmitter {
    constructor(config) {
        super();
        this.metrics = { avgResponseTimeMs: 0, currentLoad: 0 };
        this.id = config.id;
        this.specialization = config.specialization;
    }
    getMetrics() {
        return this.metrics;
    }
    updateMetrics(partial) {
        this.metrics = { ...this.metrics, ...partial };
        this.emit("metrics", this.metrics);
    }
}

import { EventEmitter } from "eventemitter3";
export class ChiefArchitect extends EventEmitter {
    constructor(router) {
        super();
        this.router = router;
    }
    /** Entry point called by SystemTrigger */
    async handleRequest(task) {
        this.emit("task_received", task);
        try {
            const result = await this.router.route(task);
            this.emit("task_completed", { taskId: task.id, result });
            return result;
        }
        catch (err) {
            this.emit("task_failed", { taskId: task.id, error: err });
            throw err;
        }
    }
}

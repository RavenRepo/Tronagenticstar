import { EventEmitter } from "eventemitter3";
import { Task } from "./types.js";
import { FrameworkRouter } from "./frameworkRouter.js";

export class ChiefArchitect extends EventEmitter {
  constructor(private router: FrameworkRouter) {
    super();
  }

  /** Entry point called by SystemTrigger */
  async handleRequest(task: Task): Promise<unknown> {
    this.emit("task_received", task);
    try {
      const result = await this.router.route(task);
      this.emit("task_completed", { taskId: task.id, result });
      return result;
    } catch (err) {
      this.emit("task_failed", { taskId: task.id, error: err });
      throw err;
    }
  }
} 
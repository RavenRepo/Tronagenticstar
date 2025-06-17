import { EventEmitter } from "eventemitter3";
import { Task } from "./types.js";
import { FrameworkRouter } from "./frameworkRouter.js";
export declare class ChiefArchitect extends EventEmitter {
    private router;
    constructor(router: FrameworkRouter);
    /** Entry point called by SystemTrigger */
    handleRequest(task: Task): Promise<unknown>;
}

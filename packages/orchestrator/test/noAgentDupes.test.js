import { afterEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { registerSpecialist, SpecialistAgent } from "../src/agentTemplates.js";
import { TaskType } from "../src/types.js";
class _TempAgent extends SpecialistAgent {
    constructor() { super({ id: "a1", specialization: TaskType.ARCHITECTURE }); }
    async _executeSpecialist(_) { return null; }
}
_TempAgent.KIND = "tempstub";
describe("noAgentDupes auto-update", () => {
    const filePath = path.resolve(process.cwd(), "docs", "noAgentDupes.md");
    afterEach(() => {
        if (fs.existsSync(filePath))
            fs.rmSync(filePath);
    });
    it("adds entry when registering specialist", () => {
        registerSpecialist(_TempAgent.KIND, _TempAgent);
        const txt = fs.readFileSync(filePath, "utf-8");
        expect(txt).toContain("tempstub");
    });
});

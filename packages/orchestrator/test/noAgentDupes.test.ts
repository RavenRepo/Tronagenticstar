import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import { registerSpecialist, SpecialistAgent } from "../src/agentTemplates.js";
import { TaskType, Task } from "../src/types.js";

class _TempAgent extends SpecialistAgent {
  static KIND = "tempstub";
  constructor() { super({ id: "a1", specialization: TaskType.ARCHITECTURE }); }
  protected async _executeSpecialist(_: Task) { return null; }
}

describe("noAgentDupes auto-update", () => {
  const filePath = path.resolve(process.cwd(), "docs", "noAgentDupes.md");

  afterEach(() => {
    if (fs.existsSync(filePath)) fs.rmSync(filePath);
  });

  it("adds entry when registering specialist", () => {
    registerSpecialist(_TempAgent.KIND, _TempAgent);
    const txt = fs.readFileSync(filePath, "utf-8");
    expect(txt).toContain("tempstub");
  });
}); 
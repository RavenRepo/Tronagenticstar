import { describe, expect, it, vi } from "vitest";
import { MemoryBankManager } from "../src/memoryBank.js";
import { MemoryEntry } from "../src/types.js";

// Mock global fetch for retriever
const mockFetch = vi.fn(async () => ({
  ok: true,
  json: async () => ([{
    id: "m1",
    content: "hello world",
    metadata: { agentId: "agent1", tags: ["QUALITY"] }
  }]),
}));
// @ts-ignore
global.fetch = mockFetch;

describe("MemoryBankManager", () => {
  it("queries retriever service", async () => {
    const mb = new MemoryBankManager("http://retriever");
    const results = await mb.queryContext({ query: "hello" });
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(results[0].content).toBe("hello world");
  });
}); 
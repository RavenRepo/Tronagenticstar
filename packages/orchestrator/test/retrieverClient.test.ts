import { describe, expect, it, vi } from "vitest";
import { RetrieverClient } from "../src/retrieverClient.js";

// Mock global fetch
const mockFetch = vi.fn(async (input: RequestInfo) => {
  if (typeof input === "string" && input.endsWith("/retrieve")) {
    return {
      ok: true,
      json: async () => ({ results: ["Stub result 1"] }),
    } as any;
  }
  if (typeof input === "string" && input.endsWith("/related")) {
    return {
      ok: true,
      json: async () => ({ relatedIds: ["id2", "id3"] }),
    } as any;
  }
  return { ok: false, status: 404, text: async () => "not found" } as any;
});
// @ts-ignore
global.fetch = mockFetch;

describe("RetrieverClient", () => {
  it("calls /retrieve and returns results", async () => {
    const client = new RetrieverClient({ baseUrl: "http://fake" });
    const result = await client.retrieve({ query: "hello", topK: 1 });
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(result.results[0]).toBe("Stub result 1");
  });

  it("calls /related and returns related ids", async () => {
    const client = new RetrieverClient({ baseUrl: "http://fake" });
    const result = await client.retrieveRelated({ id: "id1", depth: 2 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.relatedIds.length).toBe(2);
  });
}); 
import { describe, expect, it, vi } from "vitest";
import { RetrieverClient } from "../src/retrieverClient.js";
import { EmbeddingClient } from "../src/embeddingClient.js";

// Mock global fetch
const mockFetch = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
  if (typeof input === "string" && input.endsWith("/retrieve")) {
    // inspect body for rerank flag
    const body = init?.body ? JSON.parse(init.body as string) : {};
    if (body.rerank === false) {
      return {
        ok: true,
        json: async () => ({ results: ["No rerank"] }),
      } as any;
    }
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
  if (typeof input === "string" && input.endsWith("/embed")) {
    return {
      ok: true,
      json: async () => ({ embedding: [0.1, 0.2, 0.3] }),
    } as any;
  }
  if (typeof input === "string" && input.endsWith("/embed/batch")) {
    return {
      ok: true,
      json: async () => ({ embeddings: [[0.1], [0.2]] }),
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

  it("passes rerank flag", async () => {
    const client = new RetrieverClient({ baseUrl: "http://fake" });
    const result = await client.retrieve({ query: "hello", rerank: false });
    expect(result.results[0]).toBe("No rerank");
  });

  it("embedding client single & batch", async () => {
    const eclient = new EmbeddingClient({ baseUrl: "http://fake" });
    const single = await eclient.embed("hi");
    expect(single.length).toBe(3);
    const batch = await eclient.embedBatch(["a", "b"]);
    expect(batch.length).toBe(2);
  });
}); 
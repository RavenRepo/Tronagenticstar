export interface EmbeddingClientOptions {
  baseUrl?: string; // e.g. http://localhost:8002
}

export class EmbeddingClient {
  private readonly baseUrl: string;

  constructor(opts: EmbeddingClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? process.env.EMBED_URL ?? "http://localhost:8002";
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const textBody = await res.text();
      throw new Error(`Embedding service error ${res.status}: ${textBody}`);
    }
    const data = (await res.json()) as { embedding: number[] };
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts.length) {
      return [];
    }
    const res = await fetch(`${this.baseUrl}/embed/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    });

    if (!res.ok) {
      const textBody = await res.text();
      throw new Error(`Embedding service error ${res.status}: ${textBody}`);
    }
    const data = (await res.json()) as { embeddings: number[][] };
    return data.embeddings;
  }
} 
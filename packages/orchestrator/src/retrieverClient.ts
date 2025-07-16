export interface RetrieverClientOptions {
  baseUrl?: string; // e.g. http://localhost:8001
}

export interface RetrieveQuery {
  query: string;
  topK?: number;
  sources?: string[];
}

export interface RetrieveResult {
  results: string[];
}

export interface RelatedRequest {
  id: string;
  depth?: number;
  limit?: number;
}

export interface RelatedResponse {
  relatedIds: string[];
}

export class RetrieverClient {
  private readonly baseUrl: string;

  constructor(opts: RetrieverClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? process.env.RETRIEVER_URL ?? "http://localhost:8001";
  }

  async retrieve(req: RetrieveQuery): Promise<RetrieveResult> {
    const res = await fetch(`${this.baseUrl}/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: req.query,
        top_k: req.topK ?? 5,
        sources: req.sources ?? undefined,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Retriever error ${res.status}: ${text}`);
    }
    return res.json() as Promise<RetrieveResult>;
  }

  async retrieveRelated(req: RelatedRequest): Promise<RelatedResponse> {
    const res = await fetch(`${this.baseUrl}/related`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: req.id,
        depth: req.depth ?? 1,
        limit: req.limit ?? 10,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Retriever error ${res.status}: ${text}`);
    }

    return res.json() as Promise<RelatedResponse>;
  }
} 
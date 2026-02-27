"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Book,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Check,
  Database,
  FileText,
  Filter,
  GitBranch,
  Globe,
  Hash,
  Layers,
  Link2,
  Loader2,
  LucideIcon,
  Network,
  RefreshCw,
  Search,
  Server,
  Share2,
  Sparkles,
  Tag,
  X,
  XCircle,
  Zap,
  Box,
  CircleDot,
  Workflow,
  BarChart3,
  HardDrive,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphStats {
  totalNodes: number;
  totalRelationships: number;
  nodeLabels: { label: string; count: number }[];
  relationshipTypes: { type: string; count: number }[];
  lastUpdated: Date | null;
}

interface GraphNode {
  id: string;
  labels: string[];
  name: string;
  properties: Record<string, unknown>;
}

interface GraphRelationship {
  id: string;
  type: string;
  startNode: string;
  endNode: string;
  properties: Record<string, unknown>;
}

interface VectorCollection {
  name: string;
  vectorCount: number;
  vectorSize: number;
  status: "green" | "yellow" | "red" | "unknown";
  onDiskPayloadSize: number | null;
}

interface VectorSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

interface MemoryEntry {
  id: string;
  content: string;
  source: string;
  timestamp: string;
  relatedIds: string[];
  tags: string[];
}

type ActiveTab = "graph" | "vectors" | "memory";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const NEO4J_URL = "http://localhost:7474";
const QDRANT_URL = "http://localhost:6333";
const RETRIEVER_URL = "http://localhost:8006";
const EMBEDDING_URL = "http://localhost:8004";

// ---------------------------------------------------------------------------
// Neo4j label colors
// ---------------------------------------------------------------------------

const LABEL_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  AIAgent: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/30",
  },
  Microservice: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/30",
  },
  File: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
  },
  Function: {
    bg: "bg-violet-500/10",
    text: "text-violet-400",
    border: "border-violet-500/30",
  },
  Class: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
  },
  Interface: {
    bg: "bg-cyan-500/10",
    text: "text-cyan-400",
    border: "border-cyan-500/30",
  },
  Component: {
    bg: "bg-pink-500/10",
    text: "text-pink-400",
    border: "border-pink-500/30",
  },
  Package: {
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    border: "border-orange-500/30",
  },
  Directory: {
    bg: "bg-gray-500/10",
    text: "text-text-secondary",
    border: "border-gray-500/30",
  },
  DesignPattern: {
    bg: "bg-indigo-500/10",
    text: "text-indigo-400",
    border: "border-indigo-500/30",
  },
  LLMProvider: {
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    border: "border-purple-500/30",
  },
  DataStore: {
    bg: "bg-teal-500/10",
    text: "text-teal-400",
    border: "border-teal-500/30",
  },
  InfraComponent: {
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    border: "border-sky-500/30",
  },
  CorePackage: {
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    border: "border-rose-500/30",
  },
  Technology: {
    bg: "bg-lime-500/10",
    text: "text-lime-400",
    border: "border-lime-500/30",
  },
  Feature: {
    bg: "bg-yellow-500/10",
    text: "text-yellow-400",
    border: "border-yellow-500/30",
  },
  Issue: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/30",
  },
  SecurityFix: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/30",
  },
  ConstellaProject: {
    bg: "bg-blue-600/10",
    text: "text-blue-300",
    border: "border-blue-600/30",
  },
};

function getLabelStyle(label: string) {
  return (
    LABEL_COLORS[label] || {
      bg: "bg-gray-500/10",
      text: "text-text-secondary",
      border: "border-gray-500/30",
    }
  );
}

// ---------------------------------------------------------------------------
// Data Fetching
// ---------------------------------------------------------------------------

async function fetchGraphStats(): Promise<GraphStats> {
  const stats: GraphStats = {
    totalNodes: 0,
    totalRelationships: 0,
    nodeLabels: [],
    relationshipTypes: [],
    lastUpdated: null,
  };

  try {
    // Get node counts by label
    const nodeResp = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa("neo4j:dev-only-change-in-prod"),
      },
      body: JSON.stringify({
        statements: [
          { statement: "CALL db.labels() YIELD label RETURN label" },
          { statement: "MATCH (n) RETURN count(n) as total" },
          { statement: "MATCH ()-[r]->() RETURN count(r) as total" },
          {
            statement:
              "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType",
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (nodeResp.ok) {
      const data = await nodeResp.json();
      const results = data.results || [];

      // Labels
      if (results[0]?.data) {
        const labels = results[0].data.map((d: { row: string[] }) => d.row[0]);

        // Get count for each label
        const countResp = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Basic " + btoa("neo4j:dev-only-change-in-prod"),
          },
          body: JSON.stringify({
            statements: labels.map((label: string) => ({
              statement: `MATCH (n:\`${label}\`) RETURN count(n) as count`,
            })),
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (countResp.ok) {
          const countData = await countResp.json();
          stats.nodeLabels = labels
            .map((label: string, i: number) => ({
              label,
              count: countData.results?.[i]?.data?.[0]?.row?.[0] ?? 0,
            }))
            .sort(
              (a: { count: number }, b: { count: number }) => b.count - a.count,
            );
        }
      }

      // Total nodes
      if (results[1]?.data?.[0]) {
        stats.totalNodes = results[1].data[0].row[0];
      }

      // Total relationships
      if (results[2]?.data?.[0]) {
        stats.totalRelationships = results[2].data[0].row[0];
      }

      // Relationship types
      if (results[3]?.data) {
        stats.relationshipTypes = results[3].data.map(
          (d: { row: string[] }) => ({
            type: d.row[0],
            count: 0,
          }),
        );
      }

      stats.lastUpdated = new Date();
    }
  } catch {
    // Neo4j might not be available
  }

  return stats;
}

async function runCypherQuery(query: string): Promise<{
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  raw: unknown[];
}> {
  const result: {
    nodes: GraphNode[];
    relationships: GraphRelationship[];
    raw: unknown[];
  } = {
    nodes: [],
    relationships: [],
    raw: [],
  };

  try {
    const resp = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa("neo4j:dev-only-change-in-prod"),
      },
      body: JSON.stringify({
        statements: [
          { statement: query, resultDataContents: ["row", "graph"] },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (resp.ok) {
      const data = await resp.json();
      const stmtResult = data.results?.[0];

      if (stmtResult?.data) {
        const seenNodes = new Set<string>();
        const seenRels = new Set<string>();

        for (const entry of stmtResult.data) {
          // Raw row data
          if (entry.row) {
            result.raw.push(entry.row);
          }

          // Graph data
          if (entry.graph) {
            for (const node of entry.graph.nodes || []) {
              if (!seenNodes.has(node.id)) {
                seenNodes.add(node.id);
                result.nodes.push({
                  id: node.id,
                  labels: node.labels,
                  name:
                    node.properties.name ||
                    node.properties.id ||
                    node.properties.path ||
                    `Node ${node.id}`,
                  properties: node.properties,
                });
              }
            }
            for (const rel of entry.graph.relationships || []) {
              if (!seenRels.has(rel.id)) {
                seenRels.add(rel.id);
                result.relationships.push({
                  id: rel.id,
                  type: rel.type,
                  startNode: rel.startNode,
                  endNode: rel.endNode,
                  properties: rel.properties,
                });
              }
            }
          }
        }
      }

      if (stmtResult?.errors?.length > 0) {
        throw new Error(stmtResult.errors[0].message);
      }
    }
  } catch (err) {
    throw err;
  }

  return result;
}

async function fetchVectorCollections(): Promise<VectorCollection[]> {
  try {
    const resp = await fetch(`${QDRANT_URL}/collections`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();

    return (data.result?.collections || []).map(
      (c: { name: string; points_count?: number; vectors_count?: number }) => ({
        name: c.name,
        vectorCount: c.vectors_count || c.points_count || 0,
        vectorSize: 0,
        status: "green",
        onDiskPayloadSize: null,
      }),
    );
  } catch {
    return [];
  }
}

async function vectorSearch(
  collection: string,
  query: string,
  limit: number = 10,
): Promise<VectorSearchResult[]> {
  // First embed the query via the embedding service
  try {
    const embedResp = await fetch(`${EMBEDDING_URL}/execute_task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: `search-${Date.now()}`,
        task_type: "embed",
        parameters: { text: query },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!embedResp.ok) return [];
    const embedData = await embedResp.json();
    const vector = embedData.result?.embedding || embedData.result?.vector;
    if (!vector) return [];

    // Search Qdrant
    const searchResp = await fetch(
      `${QDRANT_URL}/collections/${collection}/points/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector, limit, with_payload: true }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!searchResp.ok) return [];
    const searchData = await searchResp.json();

    return (searchData.result || []).map(
      (r: {
        id: string | number;
        score: number;
        payload: Record<string, unknown>;
      }) => ({
        id: String(r.id),
        score: r.score,
        payload: r.payload || {},
      }),
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Utility Components
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="rounded p-1 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
      title="Copy"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function LabelBadge({ label }: { label: string }) {
  const style = getLabelStyle(label);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text} ${style.border}`}
    >
      <CircleDot className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  bg: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-secondary px-4 py-3">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}
      >
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div>
        <p className="text-xl font-bold text-text-primary">{value}</p>
        <p className="text-xs text-text-tertiary">{label}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Graph Explorer Tab
// ---------------------------------------------------------------------------

const EXAMPLE_QUERIES = [
  {
    label: "All AI Agents",
    query: "MATCH (a:AIAgent) RETURN a ORDER BY a.port LIMIT 25",
  },
  {
    label: "Agent → DataStore relationships",
    query: "MATCH (a:AIAgent)-[r]->(d:DataStore) RETURN a, r, d LIMIT 50",
  },
  {
    label: "Design Patterns",
    query: "MATCH (p:DesignPattern)<-[r]-(n) RETURN p, r, n LIMIT 50",
  },
  {
    label: "LLM Providers + Consumers",
    query: "MATCH (n)-[r]->(l:LLMProvider) RETURN n, r, l LIMIT 30",
  },
  {
    label: "Infrastructure Overview",
    query: "MATCH (c:ConstellaProject)-[r]->(n) RETURN c, r, n LIMIT 50",
  },
  {
    label: "Files with most functions",
    query:
      "MATCH (f:File)<-[:DEFINED_IN]-(fn:Function) WITH f, count(fn) as fns ORDER BY fns DESC RETURN f.path, fns LIMIT 20",
  },
  {
    label: "Security Fixes",
    query: "MATCH (s:SecurityFix) RETURN s ORDER BY s.severity LIMIT 20",
  },
  {
    label: "Core Packages",
    query: "MATCH (c:CorePackage)-[r]->(n) RETURN c, r, n LIMIT 30",
  },
];

function GraphExplorer({ stats }: { stats: GraphStats }) {
  const [query, setQuery] = useState(
    "MATCH (a:AIAgent) RETURN a ORDER BY a.port LIMIT 25",
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [relationships, setRelationships] = useState<GraphRelationship[]>([]);
  const [rawRows, setRawRows] = useState<unknown[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [viewMode, setViewMode] = useState<"nodes" | "raw">("nodes");

  const executeQuery = useCallback(async () => {
    if (!query.trim()) return;
    setRunning(true);
    setError(null);
    setSelectedNode(null);

    try {
      const result = await runCypherQuery(query);
      setNodes(result.nodes);
      setRelationships(result.relationships);
      setRawRows(result.raw);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Query failed");
      setNodes([]);
      setRelationships([]);
      setRawRows([]);
    } finally {
      setRunning(false);
    }
  }, [query]);

  useEffect(() => {
    executeQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total Nodes"
          value={stats.totalNodes.toLocaleString()}
          icon={CircleDot}
          color="text-blue-400"
          bg="bg-blue-500/10"
        />
        <StatCard
          label="Relationships"
          value={stats.totalRelationships.toLocaleString()}
          icon={Share2}
          color="text-violet-400"
          bg="bg-violet-500/10"
        />
        <StatCard
          label="Node Labels"
          value={stats.nodeLabels.length}
          icon={Tag}
          color="text-emerald-400"
          bg="bg-emerald-500/10"
        />
        <StatCard
          label="Rel Types"
          value={stats.relationshipTypes.length}
          icon={Link2}
          color="text-amber-400"
          bg="bg-amber-500/10"
        />
      </div>

      {/* Label distribution */}
      <div className="rounded-xl border border-border bg-bg-secondary p-4">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">
          Node Label Distribution
        </h3>
        <div className="flex flex-wrap gap-2">
          {stats.nodeLabels.slice(0, 20).map((item) => {
            const style = getLabelStyle(item.label);
            return (
              <button
                key={item.label}
                onClick={() => {
                  setQuery(`MATCH (n:\`${item.label}\`) RETURN n LIMIT 25`);
                  setTimeout(() => executeQuery(), 100);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80 ${style.bg} ${style.text} ${style.border}`}
              >
                {item.label}
                <span className="opacity-60">{item.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Query Editor */}
      <div className="rounded-xl border border-border bg-bg-secondary p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Cypher Query</h3>
          <div className="flex items-center gap-2">
            {/* Example queries dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-1 rounded-lg border border-border-light bg-bg-secondary px-2.5 py-1.5 text-[11px] text-text-secondary transition-colors hover:bg-bg-hover">
                <Book className="h-3 w-3" />
                Examples
              </button>
              <div className="absolute right-0 top-full z-30 mt-1 hidden w-80 rounded-xl border border-border-light bg-bg-primary p-2 shadow-xl group-hover:block">
                {EXAMPLE_QUERIES.map((eq) => (
                  <button
                    key={eq.label}
                    onClick={() => {
                      setQuery(eq.query);
                    }}
                    className="flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors hover:bg-bg-hover"
                  >
                    <span className="text-xs font-medium text-text-primary">
                      {eq.label}
                    </span>
                    <span className="mt-0.5 truncate font-mono text-[10px] text-text-tertiary">
                      {eq.query}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") executeQuery();
            }}
            rows={3}
            className="flex-1 resize-none rounded-lg border border-border-light bg-bg-secondary px-4 py-3 font-mono text-sm text-text-primary placeholder-gray-600 outline-none transition-colors focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
            placeholder="MATCH (n) RETURN n LIMIT 25"
          />
          <button
            onClick={executeQuery}
            disabled={running || !query.trim()}
            className="flex h-auto items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-sm font-semibold text-text-primary shadow-lg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-text-tertiary">
          Press{" "}
          <kbd className="rounded border border-border-light bg-bg-hover px-1 py-0.5 font-mono text-[9px]">
            Ctrl+Enter
          </kbd>{" "}
          to execute
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 shrink-0 text-red-400" />
            <p className="text-sm font-medium text-red-400">Query Error</p>
          </div>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-red-300">
            {error}
          </pre>
        </div>
      )}

      {/* Results */}
      {!error && (nodes.length > 0 || rawRows.length > 0) && (
        <div className="rounded-xl border border-border bg-bg-secondary">
          {/* Result header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-text-primary">Results</span>
              <span className="text-xs text-text-tertiary">
                {nodes.length} nodes &middot; {relationships.length}{" "}
                relationships &middot; {rawRows.length} rows
              </span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setViewMode("nodes")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === "nodes"
                    ? "bg-bg-hover text-text-primary"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                Nodes
              </button>
              <button
                onClick={() => setViewMode("raw")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === "raw"
                    ? "bg-bg-hover text-text-primary"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                Raw
              </button>
            </div>
          </div>

          <div className="p-4">
            {viewMode === "nodes" && nodes.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {nodes.map((node) => (
                  <button
                    key={node.id}
                    onClick={() =>
                      setSelectedNode(
                        selectedNode?.id === node.id ? null : node,
                      )
                    }
                    className={`flex flex-col rounded-xl border p-4 text-left transition-all hover:bg-bg-hover ${
                      selectedNode?.id === node.id
                        ? "border-blue-500/40 bg-blue-500/5"
                        : "border-border bg-bg-secondary"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {node.name}
                      </p>
                      <span className="shrink-0 font-mono text-[9px] text-text-tertiary">
                        #{node.id}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {node.labels.map((label) => (
                        <LabelBadge key={label} label={label} />
                      ))}
                    </div>
                    {Boolean(node.properties.description) && (
                      <p className="mt-2 line-clamp-2 text-xs text-text-secondary">
                        {String(node.properties.description)}
                      </p>
                    )}
                    {Boolean(node.properties.port) && (
                      <p className="mt-1 font-mono text-[10px] text-text-tertiary">
                        Port: {String(node.properties.port)}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {viewMode === "nodes" &&
              nodes.length === 0 &&
              rawRows.length > 0 && (
                <div className="text-center py-4">
                  <p className="text-sm text-text-secondary">
                    No graph nodes returned. Switch to <strong>Raw</strong> view
                    to see tabular results.
                  </p>
                </div>
              )}

            {viewMode === "raw" && rawRows.length > 0 && (
              <div className="max-h-96 overflow-auto">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-text-secondary">
                  {JSON.stringify(rawRows, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selected Node Detail */}
      {selectedNode && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CircleDot className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-text-primary">
                {selectedNode.name}
              </h3>
              {selectedNode.labels.map((l) => (
                <LabelBadge key={l} label={l} />
              ))}
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(selectedNode.properties).map(([key, value]) => (
              <div key={key} className="flex items-start gap-2">
                <span className="shrink-0 font-mono text-[10px] text-text-tertiary">
                  {key}:
                </span>
                <span className="break-words font-mono text-[10px] text-text-secondary">
                  {typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <CopyButton
              text={JSON.stringify(selectedNode.properties, null, 2)}
            />
            <button
              onClick={() => {
                setQuery(
                  `MATCH (n)-[r]-(m) WHERE id(n) = ${selectedNode.id} RETURN n, r, m LIMIT 25`,
                );
              }}
              className="rounded-lg border border-border-light bg-bg-secondary px-2.5 py-1 text-[10px] font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              Explore neighbors →
            </button>
          </div>
        </div>
      )}

      {/* Relationships */}
      {relationships.length > 0 && (
        <div className="rounded-xl border border-border bg-bg-secondary p-4">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">
            Relationships ({relationships.length})
          </h3>
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {relationships.map((rel) => {
              const startNode = nodes.find((n) => n.id === rel.startNode);
              const endNode = nodes.find((n) => n.id === rel.endNode);
              return (
                <div
                  key={rel.id}
                  className="flex items-center gap-2 rounded-lg bg-bg-secondary px-3 py-2 text-xs"
                >
                  <span className="truncate font-medium text-text-secondary">
                    {startNode?.name || `#${rel.startNode}`}
                  </span>
                  <span className="shrink-0 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono text-[10px] text-violet-400">
                    {rel.type}
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-text-tertiary" />
                  <span className="truncate font-medium text-text-secondary">
                    {endNode?.name || `#${rel.endNode}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vectors Tab
// ---------------------------------------------------------------------------

function VectorsExplorer() {
  const [collections, setCollections] = useState<VectorCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCollection, setSearchCollection] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<VectorSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [qdrantHealthy, setQdrantHealthy] = useState<boolean | null>(null);

  const loadCollections = useCallback(async () => {
    setLoading(true);
    try {
      const healthResp = await fetch(`${QDRANT_URL}/healthz`, {
        signal: AbortSignal.timeout(5000),
      });
      setQdrantHealthy(healthResp.ok);
    } catch {
      setQdrantHealthy(false);
    }
    const cols = await fetchVectorCollections();
    setCollections(cols);
    if (cols.length > 0 && !searchCollection) {
      setSearchCollection(cols[0].name);
    }
    setLoading(false);
  }, [searchCollection]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !searchCollection) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const results = await vectorSearch(searchCollection, searchQuery);
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError(
          "No results found. The collection may be empty or the embedding service may be offline.",
        );
      }
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Qdrant status */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="Qdrant Status"
          value={
            qdrantHealthy === null
              ? "Checking…"
              : qdrantHealthy
                ? "Healthy"
                : "Offline"
          }
          icon={Database}
          color={qdrantHealthy ? "text-emerald-400" : "text-red-400"}
          bg={qdrantHealthy ? "bg-emerald-500/10" : "bg-red-500/10"}
        />
        <StatCard
          label="Collections"
          value={collections.length}
          icon={Layers}
          color="text-blue-400"
          bg="bg-blue-500/10"
        />
        <StatCard
          label="Total Vectors"
          value={collections
            .reduce((s, c) => s + c.vectorCount, 0)
            .toLocaleString()}
          icon={Box}
          color="text-violet-400"
          bg="bg-violet-500/10"
        />
      </div>

      {/* Collections List */}
      <div className="rounded-xl border border-border bg-bg-secondary p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Collections</h3>
          <button
            onClick={loadCollections}
            disabled={loading}
            className="flex items-center gap-1 rounded-lg border border-border-light bg-bg-secondary px-2 py-1 text-[10px] text-text-secondary transition-colors hover:bg-bg-hover"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {collections.length === 0 ? (
          <div className="py-8 text-center">
            <Database className="mx-auto h-10 w-10 text-gray-700" />
            <p className="mt-3 text-sm text-text-tertiary">
              No vector collections found.
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              Run{" "}
              <code className="rounded bg-bg-hover px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                python3 scripts/index_knowledge_graph_vectors.py
              </code>{" "}
              to seed embeddings.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {collections.map((col) => (
              <div
                key={col.name}
                className="flex items-center justify-between rounded-lg border border-border bg-bg-secondary px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
                    <Database className="h-4 w-4 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">{col.name}</p>
                    <p className="text-[10px] text-text-tertiary">
                      {col.vectorCount.toLocaleString()} vectors
                    </p>
                  </div>
                </div>
                <span
                  className={`h-2 w-2 rounded-full ${
                    col.status === "green"
                      ? "bg-emerald-400"
                      : col.status === "yellow"
                        ? "bg-yellow-400"
                        : col.status === "red"
                          ? "bg-red-400"
                          : "bg-gray-500"
                  }`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Semantic Search */}
      <div className="rounded-xl border border-border bg-bg-secondary p-4">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">
          Semantic Search
        </h3>

        {collections.length > 0 && (
          <div className="mb-3">
            <label className="mb-1 block text-[10px] font-medium text-text-tertiary">
              Collection
            </label>
            <select
              value={searchCollection}
              onChange={(e) => setSearchCollection(e.target.value)}
              className="w-full appearance-none rounded-lg border border-border-light bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-blue-500/50"
            >
              {collections.map((c) => (
                <option key={c.name} value={c.name} className="bg-bg-primary">
                  {c.name} ({c.vectorCount} vectors)
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              placeholder="Enter a natural language query…"
              className="w-full rounded-lg border border-border-light bg-bg-secondary py-2.5 pl-9 pr-4 text-sm text-text-primary placeholder-gray-600 outline-none transition-colors focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={
              searching || !searchQuery.trim() || collections.length === 0
            }
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-semibold text-text-primary shadow-lg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Search
          </button>
        </div>

        {searchError && (
          <div className="mt-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
            <p className="text-xs text-yellow-400">{searchError}</p>
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-text-tertiary">
              {searchResults.length} results
            </p>
            {searchResults.map((result, idx) => (
              <div
                key={result.id}
                className="rounded-lg border border-border bg-bg-secondary p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-text-secondary">
                    #{idx + 1} &middot; ID: {result.id}
                  </span>
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                    Score: {result.score.toFixed(4)}
                  </span>
                </div>
                {Boolean(result.payload.content) && (
                  <p className="mt-2 line-clamp-3 text-sm text-text-primary">
                    {String(result.payload.content)}
                  </p>
                )}
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-bg-secondary p-2 font-mono text-[10px] text-text-secondary">
                  {JSON.stringify(result.payload, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connection info */}
      <div className="rounded-xl border border-border bg-bg-secondary p-4">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">
          Connection Info
        </h3>
        <div className="space-y-2">
          {[
            { label: "Qdrant HTTP", url: QDRANT_URL },
            { label: "Qdrant Dashboard", url: `${QDRANT_URL}/dashboard` },
            { label: "Embedding Service", url: EMBEDDING_URL },
            { label: "Retriever Service", url: RETRIEVER_URL },
          ].map((ep) => (
            <div key={ep.label} className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">{ep.label}</span>
              <div className="flex items-center gap-1">
                <code className="rounded bg-bg-hover px-2 py-0.5 font-mono text-[10px] text-text-secondary">
                  {ep.url}
                </code>
                <CopyButton text={ep.url} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memory Index Tab
// ---------------------------------------------------------------------------

function MemoryExplorer() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMemory, setSelectedMemory] = useState<MemoryEntry | null>(
    null,
  );

  const loadMemories = useCallback(async () => {
    setLoading(true);
    // Try fetching from Neo4j memory nodes
    try {
      const result = await runCypherQuery(
        "MATCH (n) WHERE n.content IS NOT NULL RETURN n.id AS id, n.content AS content, labels(n) AS labels, n.created_at AS timestamp LIMIT 50",
      );
      const entries: MemoryEntry[] = result.raw.map((row: unknown) => {
        const r = row as [string, string, string[], string];
        return {
          id: r[0] || `mem-${Math.random().toString(36).slice(2, 8)}`,
          content: r[1] || "",
          source: (r[2] || []).join(", ") || "Neo4j",
          timestamp: r[3] || new Date().toISOString(),
          relatedIds: [],
          tags: r[2] || [],
        };
      });
      setMemories(entries);
    } catch {
      // Fallback: show a helpful empty state
      setMemories([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="Memory Entries"
          value={memories.length}
          icon={BrainCircuit}
          color="text-purple-400"
          bg="bg-purple-500/10"
        />
        <StatCard
          label="Sources"
          value={new Set(memories.map((m) => m.source)).size}
          icon={Layers}
          color="text-cyan-400"
          bg="bg-cyan-500/10"
        />
        <StatCard
          label="With Relations"
          value={memories.filter((m) => m.relatedIds.length > 0).length}
          icon={Link2}
          color="text-emerald-400"
          bg="bg-emerald-500/10"
        />
      </div>

      <div className="rounded-xl border border-border bg-bg-secondary p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Memory Index</h3>
          <button
            onClick={loadMemories}
            disabled={loading}
            className="flex items-center gap-1 rounded-lg border border-border-light bg-bg-secondary px-2 py-1 text-[10px] text-text-secondary transition-colors hover:bg-bg-hover"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
          </div>
        ) : memories.length === 0 ? (
          <div className="py-8 text-center">
            <BrainCircuit className="mx-auto h-10 w-10 text-gray-700" />
            <p className="mt-3 text-sm text-text-tertiary">
              No memory entries found in the knowledge graph.
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              Memory entries are created when agents process tasks and store
              context for future retrieval.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {memories.map((mem) => (
              <button
                key={mem.id}
                onClick={() =>
                  setSelectedMemory(selectedMemory?.id === mem.id ? null : mem)
                }
                className={`w-full rounded-lg border p-4 text-left transition-all hover:bg-bg-hover ${
                  selectedMemory?.id === mem.id
                    ? "border-purple-500/30 bg-purple-500/5"
                    : "border-border bg-bg-secondary"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm text-text-primary">
                    {mem.content}
                  </p>
                  <span className="shrink-0 font-mono text-[9px] text-text-tertiary">
                    {mem.id}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[10px] text-text-tertiary">
                  <span className="flex items-center gap-1">
                    <Database className="h-2.5 w-2.5" />
                    {mem.source}
                  </span>
                  {mem.tags.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Tag className="h-2.5 w-2.5" />
                      {mem.tags.slice(0, 3).join(", ")}
                    </span>
                  )}
                  {mem.relatedIds.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Link2 className="h-2.5 w-2.5" />
                      {mem.relatedIds.length} related
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedMemory && (
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Memory Detail</h3>
            <button
              onClick={() => setSelectedMemory(null)}
              className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <span className="text-[10px] font-medium text-text-tertiary">ID</span>
              <p className="mt-0.5 font-mono text-xs text-text-secondary">
                {selectedMemory.id}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-medium text-text-tertiary">
                Content
              </span>
              <p className="mt-0.5 text-sm leading-relaxed text-text-primary">
                {selectedMemory.content}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-medium text-text-tertiary">
                Source
              </span>
              <p className="mt-0.5 text-xs text-text-secondary">
                {selectedMemory.source}
              </p>
            </div>
            {selectedMemory.tags.length > 0 && (
              <div>
                <span className="text-[10px] font-medium text-text-tertiary">
                  Tags
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedMemory.tags.map((tag) => (
                    <LabelBadge key={tag} label={tag} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Architecture diagram */}
      <div className="rounded-xl border border-border bg-bg-secondary p-4">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">
          Memory Architecture
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              name: "Redis",
              role: "Hot Storage",
              description:
                "Real-time agent state, active session context, fast key-value lookups",
              icon: Zap,
              color: "text-red-400",
              bg: "bg-red-500/10",
              port: 6379,
            },
            {
              name: "Qdrant",
              role: "Vector Storage",
              description:
                "Semantic embeddings, similarity search, RAG retrieval pipeline",
              icon: Database,
              color: "text-violet-400",
              bg: "bg-violet-500/10",
              port: 6333,
            },
            {
              name: "Neo4j",
              role: "Graph Storage",
              description:
                "Knowledge graph, relationships, agent topology, architectural decisions",
              icon: Network,
              color: "text-blue-400",
              bg: "bg-blue-500/10",
              port: 7474,
            },
          ].map((store) => {
            const StoreIcon = store.icon;
            return (
              <div
                key={store.name}
                className="rounded-lg border border-border bg-bg-secondary p-4"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${store.bg}`}
                  >
                    <StoreIcon className={`h-4 w-4 ${store.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {store.name}
                    </p>
                    <p className="text-[10px] text-text-tertiary">{store.role}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                  {store.description}
                </p>
                <p className="mt-2 font-mono text-[10px] text-text-tertiary">
                  Port: {store.port}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function KnowledgeBasePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("graph");
  const [stats, setStats] = useState<GraphStats>({
    totalNodes: 0,
    totalRelationships: 0,
    nodeLabels: [],
    relationshipTypes: [],
    lastUpdated: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    setRefreshing(true);
    const s = await fetchGraphStats();
    setStats(s);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const tabs: { id: ActiveTab; label: string; icon: LucideIcon }[] = [
    { id: "graph", label: "Knowledge Graph", icon: Network },
    { id: "vectors", label: "Vector Search", icon: Database },
    { id: "memory", label: "Memory Index", icon: BrainCircuit },
  ];

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      {/* Header */}
      <header className="border-b border-border bg-bg-primary">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-text-primary">
              Knowledge Base
            </h1>
            <p className="text-xs text-text-tertiary">
              {stats.totalNodes.toLocaleString()} nodes &middot;{" "}
              {stats.totalRelationships.toLocaleString()} relationships &middot;{" "}
              {stats.nodeLabels.length} labels
            </p>
          </div>
          <div className="flex items-center gap-2">
            {stats.lastUpdated && (
              <span className="hidden text-[10px] text-text-tertiary sm:block">
                Updated:{" "}
                {stats.lastUpdated.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            <button
              onClick={loadStats}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-border-light bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-border bg-bg-primary">
        <div className="mx-auto flex max-w-7xl gap-0 px-4 sm:px-6 lg:px-8">
          {tabs.map((tab) => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-500 text-text-primary"
                    : "border-transparent text-text-tertiary hover:border-border-light hover:text-text-secondary"
                }`}
              >
                <TabIcon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {loading && activeTab === "graph" ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-text-tertiary" />
          </div>
        ) : (
          <>
            {activeTab === "graph" && <GraphExplorer stats={stats} />}
            {activeTab === "vectors" && <VectorsExplorer />}
            {activeTab === "memory" && <MemoryExplorer />}
          </>
        )}
      </main>
    </div>
  );
}

/**
 * Constella BeeAI Framework - Metrics Type Definitions
 *
 * Comprehensive metrics system for monitoring framework performance,
 * resource usage, and operational insights
 */

import { JSONObject, JSONValue, UUID, Timestamp } from './index';

// ============================================================================
// BASE METRIC TYPES
// ============================================================================

export interface BaseMetric {
  id: UUID;
  name: string;
  description: string;
  unit: string;
  timestamp: Timestamp;
  value: number;
  tags: Record<string, string>;
  metadata?: JSONObject;
}

export interface MetricPoint {
  timestamp: Timestamp;
  value: number;
  tags?: Record<string, string>;
}

export interface TimeSeries {
  metric_name: string;
  points: MetricPoint[];
  aggregation?: AggregationType;
  interval?: TimeInterval;
}

export type AggregationType = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'rate' | 'percentile';
export type TimeInterval = '1s' | '10s' | '1m' | '5m' | '15m' | '1h' | '6h' | '1d';

// ============================================================================
// METRIC CATEGORIES
// ============================================================================

export interface PerformanceMetric extends BaseMetric {
  category: 'performance';
  component: string;
  operation?: string;
}

export interface ResourceMetric extends BaseMetric {
  category: 'resource';
  resource_type: 'cpu' | 'memory' | 'disk' | 'network' | 'gpu';
  limit?: number;
  threshold?: number;
}

export interface BusinessMetric extends BaseMetric {
  category: 'business';
  kpi_type: 'usage' | 'satisfaction' | 'efficiency' | 'cost' | 'quality';
}

export interface SystemMetric extends BaseMetric {
  category: 'system';
  subsystem: string;
  health_status?: 'healthy' | 'degraded' | 'unhealthy';
}

// ============================================================================
// AGENT METRICS
// ============================================================================

export interface AgentMetrics {
  agent_id: string;
  agent_name: string;
  timestamp: Timestamp;

  // Performance metrics
  execution_count: number;
  avg_execution_time_ms: number;
  total_execution_time_ms: number;
  success_rate: number;
  error_rate: number;

  // Token usage
  total_tokens_used: number;
  avg_tokens_per_execution: number;
  input_tokens: number;
  output_tokens: number;

  // Tool usage
  tool_calls_count: number;
  unique_tools_used: number;
  avg_tools_per_execution: number;

  // Quality metrics
  requirement_violations: number;
  constraint_enforcements: number;
  handoff_count: number;

  // Resource usage
  memory_usage_mb: number;
  cpu_usage_percent: number;

  // Cost metrics
  estimated_cost_usd: number;
  cost_per_execution: number;
}

// ============================================================================
// TOOL METRICS
// ============================================================================

export interface ToolMetrics {
  tool_name: string;
  timestamp: Timestamp;

  // Usage metrics
  execution_count: number;
  unique_agents_used: number;
  avg_execution_time_ms: number;

  // Success metrics
  success_count: number;
  failure_count: number;
  success_rate: number;

  // Performance metrics
  min_execution_time_ms: number;
  max_execution_time_ms: number;
  p95_execution_time_ms: number;
  p99_execution_time_ms: number;

  // Error metrics
  validation_failures: number;
  timeout_count: number;
  retry_count: number;

  // Resource metrics
  avg_memory_usage_mb: number;
  peak_memory_usage_mb: number;
  network_requests_count: number;
  external_api_calls: number;
}

// ============================================================================
// WORKFLOW METRICS
// ============================================================================

export interface WorkflowMetrics {
  workflow_id: UUID;
  workflow_name: string;
  timestamp: Timestamp;

  // Execution metrics
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  cancelled_executions: number;

  // Performance metrics
  avg_execution_time_ms: number;
  min_execution_time_ms: number;
  max_execution_time_ms: number;

  // Step metrics
  total_steps: number;
  avg_steps_per_execution: number;
  step_failure_rate: number;

  // Parallel execution metrics
  avg_parallel_steps: number;
  max_parallel_steps: number;
  parallelism_efficiency: number;

  // Resource metrics
  total_agents_used: number;
  total_tools_used: number;
  total_tokens_consumed: number;

  // Cost metrics
  total_cost_usd: number;
  avg_cost_per_execution: number;
}

// ============================================================================
// MEMORY METRICS
// ============================================================================

export interface MemoryMetrics {
  provider_name: string;
  timestamp: Timestamp;

  // Storage metrics
  total_records: number;
  total_size_bytes: number;
  avg_record_size_bytes: number;

  // Performance metrics
  avg_write_time_ms: number;
  avg_read_time_ms: number;
  avg_search_time_ms: number;

  // Usage metrics
  reads_per_second: number;
  writes_per_second: number;
  searches_per_second: number;

  // Cache metrics (if applicable)
  cache_hit_ratio: number;
  cache_miss_ratio: number;
  cache_size_bytes: number;

  // Vector metrics (for vector databases)
  vector_dimensions?: number;
  index_size_bytes?: number;
  similarity_search_latency_ms?: number;

  // Graph metrics (for graph databases)
  node_count?: number;
  edge_count?: number;
  traversal_time_ms?: number;
}

// ============================================================================
// LLM PROVIDER METRICS
// ============================================================================

export interface LLMProviderMetrics {
  provider_name: string;
  model_name: string;
  timestamp: Timestamp;

  // Request metrics
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  rate_limited_requests: number;

  // Performance metrics
  avg_response_time_ms: number;
  p95_response_time_ms: number;
  p99_response_time_ms: number;

  // Token metrics
  total_input_tokens: number;
  total_output_tokens: number;
  avg_tokens_per_request: number;

  // Cost metrics
  total_cost_usd: number;
  cost_per_token: number;
  cost_per_request: number;

  // Quality metrics
  completion_rate: number;
  timeout_rate: number;
  error_rate: number;

  // Rate limiting
  requests_per_minute: number;
  rate_limit_threshold: number;
  quota_remaining: number;
}

// ============================================================================
// SYSTEM METRICS
// ============================================================================

export interface SystemMetrics {
  timestamp: Timestamp;

  // Application metrics
  uptime_seconds: number;
  active_connections: number;
  request_rate_per_second: number;
  error_rate_per_second: number;

  // Resource metrics
  cpu_usage_percent: number;
  memory_usage_mb: number;
  memory_limit_mb: number;
  disk_usage_gb: number;
  disk_available_gb: number;

  // Network metrics
  network_in_bytes_per_second: number;
  network_out_bytes_per_second: number;
  active_tcp_connections: number;

  // Process metrics
  process_count: number;
  thread_count: number;
  file_descriptor_count: number;

  // Database metrics
  database_connections: number;
  database_query_time_ms: number;
  database_query_rate: number;

  // Cache metrics
  cache_hit_ratio: number;
  cache_memory_usage_mb: number;
  cache_eviction_rate: number;
}

// ============================================================================
// QUALITY METRICS
// ============================================================================

export interface QualityMetrics {
  timestamp: Timestamp;

  // Code quality
  code_quality_score: number;
  security_scan_score: number;
  performance_score: number;
  maintainability_score: number;

  // Agent quality
  agent_accuracy_rate: number;
  requirement_compliance_rate: number;
  task_completion_rate: number;
  user_satisfaction_score: number;

  // Output quality
  response_relevance_score: number;
  response_coherence_score: number;
  response_completeness_score: number;
  factual_accuracy_score: number;

  // System quality
  availability_percentage: number;
  reliability_score: number;
  consistency_score: number;
  robustness_score: number;
}

// ============================================================================
// COST METRICS
// ============================================================================

export interface CostMetrics {
  timestamp: Timestamp;
  period: 'hour' | 'day' | 'week' | 'month';

  // LLM costs
  llm_cost_usd: number;
  total_tokens_cost: number;
  cost_per_conversation: number;

  // Infrastructure costs
  compute_cost_usd: number;
  storage_cost_usd: number;
  network_cost_usd: number;

  // Operational costs
  total_operational_cost: number;
  cost_per_user: number;
  cost_per_task: number;

  // Efficiency metrics
  cost_efficiency_ratio: number;
  roi_percentage: number;
  cost_savings_usd: number;
}

// ============================================================================
// METRIC AGGREGATION
// ============================================================================

export interface MetricAggregation {
  metric_name: string;
  aggregation_type: AggregationType;
  time_window: TimeInterval;
  group_by?: string[];
  filters?: Record<string, string>;
}

export interface AggregatedMetric {
  metric_name: string;
  aggregation_type: AggregationType;
  time_window: TimeInterval;
  timestamp: Timestamp;
  value: number;
  sample_count: number;
  groups?: Record<string, string>;
}

// ============================================================================
// METRIC ALERTS
// ============================================================================

export interface MetricThreshold {
  metric_name: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number;
  duration_seconds?: number;
  severity: 'info' | 'warning' | 'critical';
}

export interface MetricAlert {
  id: UUID;
  threshold: MetricThreshold;
  triggered_at: Timestamp;
  resolved_at?: Timestamp;
  current_value: number;
  status: 'active' | 'resolved' | 'acknowledged';
  message: string;
  metadata?: JSONObject;
}

// ============================================================================
// METRIC COLLECTION
// ============================================================================

export interface MetricCollectionConfig {
  enabled: boolean;
  collection_interval_seconds: number;
  retention_days: number;
  aggregation_intervals: TimeInterval[];
  export_endpoints?: string[];
}

export interface MetricCollector {
  name: string;
  collect(): Promise<BaseMetric[]>;
  isEnabled(): boolean;
  getConfig(): MetricCollectionConfig;
}

// ============================================================================
// METRIC STORAGE
// ============================================================================

export interface MetricStorage {
  store(metric: BaseMetric): Promise<void>;
  storeBatch(metrics: BaseMetric[]): Promise<void>;
  query(query: MetricQuery): Promise<BaseMetric[]>;
  aggregate(aggregation: MetricAggregation): Promise<AggregatedMetric[]>;
  getTimeSeries(metricName: string, start: Timestamp, end: Timestamp): Promise<TimeSeries>;
  delete(metricId: UUID): Promise<boolean>;
  cleanup(olderThan: Timestamp): Promise<number>;
}

export interface MetricQuery {
  metric_names?: string[];
  start_time?: Timestamp;
  end_time?: Timestamp;
  tags?: Record<string, string>;
  limit?: number;
  offset?: number;
  order_by?: 'timestamp' | 'value';
  order_direction?: 'asc' | 'desc';
}

// ============================================================================
// METRIC EXPORT
// ============================================================================

export interface MetricExporter {
  export(metrics: BaseMetric[]): Promise<void>;
  exportTimeSeries(series: TimeSeries): Promise<void>;
  getFormat(): 'prometheus' | 'json' | 'csv' | 'influxdb';
}

export interface PrometheusMetric {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  labels: Record<string, string>;
  value: number;
  timestamp?: number;
}

// ============================================================================
// DASHBOARD METRICS
// ============================================================================

export interface DashboardWidget {
  id: UUID;
  title: string;
  type: 'line_chart' | 'bar_chart' | 'gauge' | 'counter' | 'table' | 'heat_map';
  metric_query: MetricQuery;
  aggregation?: MetricAggregation;
  refresh_interval_seconds: number;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  configuration?: JSONObject;
}

export interface Dashboard {
  id: UUID;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  tags: string[];
  created_at: Timestamp;
  updated_at: Timestamp;
  created_by: string;
  is_public: boolean;
}

// ============================================================================
// METRIC UTILITIES
// ============================================================================

export class MetricBuilder {
  private metric: Partial<BaseMetric>;

  constructor(name: string, value: number, unit: string) {
    this.metric = {
      id: this.generateUUID(),
      name,
      value,
      unit,
      timestamp: new Date().toISOString(),
      tags: {},
      metadata: {}
    };
  }

  withDescription(description: string): this {
    this.metric.description = description;
    return this;
  }

  withTag(key: string, value: string): this {
    this.metric.tags![key] = value;
    return this;
  }

  withTags(tags: Record<string, string>): this {
    this.metric.tags = { ...this.metric.tags, ...tags };
    return this;
  }

  withMetadata(metadata: JSONObject): this {
    this.metric.metadata = { ...this.metric.metadata, ...metadata };
    return this;
  }

  withTimestamp(timestamp: Timestamp): this {
    this.metric.timestamp = timestamp;
    return this;
  }

  build(): BaseMetric {
    if (!this.metric.name || this.metric.value === undefined || !this.metric.unit) {
      throw new Error('Metric name, value, and unit are required');
    }
    return this.metric as BaseMetric;
  }

  private generateUUID(): UUID {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// ============================================================================
// PERFORMANCE TRACKING
// ============================================================================

export class PerformanceTracker {
  private startTime: number;
  private name: string;
  private tags: Record<string, string>;

  constructor(name: string, tags: Record<string, string> = {}) {
    this.name = name;
    this.tags = tags;
    this.startTime = Date.now();
  }

  stop(): BaseMetric {
    const duration = Date.now() - this.startTime;
    return new MetricBuilder(this.name, duration, 'ms')
      .withTags(this.tags)
      .withDescription(`Performance tracking for ${this.name}`)
      .build();
  }

  static track<T>(name: string, fn: () => T | Promise<T>, tags?: Record<string, string>): Promise<T> {
    const tracker = new PerformanceTracker(name, tags);
    const result = fn();

    if (result instanceof Promise) {
      return result.finally(() => {
        // In a real implementation, you'd send this to your metrics system
        tracker.stop();
      });
    } else {
      // In a real implementation, you'd send this to your metrics system
      tracker.stop();
      return Promise.resolve(result);
    }
  }
}

// ============================================================================
// EXPORT ALL TYPES
// ============================================================================

export * from './index';

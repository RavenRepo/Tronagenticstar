/**
 * Constella BeeAI Framework - ThinkTool
 *
 * Implements the BeeAI ThinkTool pattern for explicit agent reasoning.
 * Allows agents to think through problems step-by-step before taking action.
 */

import {
  ToolSchema,
  ToolExecutionContext,
  ToolResult,
  JSONObject,
  JSONValue,
  UUID,
  Timestamp
} from '../types';
import { Tool } from '../core/Tool';

// ============================================================================
// THINK TOOL IMPLEMENTATION
// ============================================================================

export class ThinkTool extends Tool {
  public readonly name = 'think';
  public readonly description = 'Think through a problem step-by-step before taking action';
  public readonly schema: ToolSchema = {
    name: 'think',
    description: 'Think through a problem step-by-step before taking action',
    parameters: {
      type: 'object',
      properties: {
        thought: {
          type: 'string',
          description: 'The reasoning or thought process'
        },
        reasoning_type: {
          type: 'string',
          description: 'Type of reasoning being performed',
          enum: [
            'analysis',
            'planning',
            'problem_solving',
            'evaluation',
            'reflection',
            'decision_making',
            'hypothesis_formation',
            'strategy_development'
          ]
        },
        confidence_level: {
          type: 'number',
          description: 'Confidence in the reasoning (0-1 scale)'
        },
        next_steps: {
          type: 'array',
          description: 'Planned next steps based on this thinking',
          items: {
            type: 'string'
          }
        },
        context_dependencies: {
          type: 'array',
          description: 'Information or context this reasoning depends on',
          items: {
            type: 'string'
          }
        },
        assumptions: {
          type: 'array',
          description: 'Assumptions made during this reasoning',
          items: {
            type: 'string'
          }
        },
        alternatives_considered: {
          type: 'array',
          description: 'Alternative approaches or solutions considered',
          items: {
            type: 'object',
            properties: {
              alternative: { type: 'string' },
              pros: { type: 'array', items: { type: 'string' } },
              cons: { type: 'array', items: { type: 'string' } },
              feasibility: { type: 'number' }
            }
          }
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata about the thinking process'
        }
      },
      required: ['thought']
    }
  };

  private readonly thinkingHistory: Map<string, ThinkingSession> = new Map();

  constructor() {
    super({
      timeout_ms: 5000, // Quick thinking
      retry_attempts: 1,
      cache_enabled: false, // Don't cache thinking - each thought is unique
      logging_enabled: true,
      metrics_enabled: true
    });
  }

  // ============================================================================
  // TOOL EXECUTION
  // ============================================================================

  protected async executeInternal(
    parameters: JSONObject,
    context: ToolExecutionContext
  ): Promise<JSONValue> {
    const {
      thought,
      reasoning_type = 'analysis',
      confidence_level,
      next_steps = [],
      context_dependencies = [],
      assumptions = [],
      alternatives_considered = [],
      metadata = {}
    } = parameters;

    // Validate thought content
    if (!thought || typeof thought !== 'string' || thought.trim().length === 0) {
      throw new Error('Thought cannot be empty');
    }

    // Create thinking entry
    const thinkingEntry: ThinkingEntry = {
      id: this.generateUUID(),
      timestamp: new Date().toISOString(),
      thought: thought as string,
      reasoning_type: reasoning_type as string,
      confidence_level: this.validateConfidence(confidence_level),
      next_steps: next_steps as string[],
      context_dependencies: context_dependencies as string[],
      assumptions: assumptions as string[],
      alternatives_considered: alternatives_considered as any[],
      metadata: metadata as JSONObject,
      step_number: context.step_number,
      duration_ms: 0 // Will be calculated
    };

    // Process the thinking
    const processedThinking = await this.processThinking(thinkingEntry, context);

    // Store in session history
    this.updateThinkingSession(context.conversation_id, processedThinking);

    // Return structured thinking result
    return {
      thinking_id: processedThinking.id,
      thought: processedThinking.thought,
      reasoning_type: processedThinking.reasoning_type,
      confidence_level: processedThinking.confidence_level,
      insights: processedThinking.insights,
      recommendations: processedThinking.recommendations,
      next_steps: processedThinking.next_steps,
      thinking_quality_score: processedThinking.quality_score,
      session_context: {
        total_thoughts: this.getSessionThoughtCount(context.conversation_id),
        reasoning_chain: this.getReasoningChain(context.conversation_id)
      },
      metadata: {
        ...processedThinking.metadata,
        processing_time_ms: processedThinking.duration_ms,
        context_enrichment: processedThinking.context_enrichment
      }
    };
  }

  // ============================================================================
  // THINKING PROCESSING
  // ============================================================================

  private async processThinking(
    entry: ThinkingEntry,
    context: ToolExecutionContext
  ): Promise<ProcessedThinkingEntry> {
    const startTime = Date.now();

    try {
      // Analyze the thought content
      const analysis = await this.analyzeThought(entry.thought);

      // Generate insights based on the thinking
      const insights = await this.generateInsights(entry, context);

      // Create recommendations
      const recommendations = await this.generateRecommendations(entry, insights);

      // Assess thinking quality
      const qualityScore = this.assessThinkingQuality(entry, analysis);

      // Enrich with context
      const contextEnrichment = await this.enrichWithContext(entry, context);

      entry.duration_ms = Date.now() - startTime;

      return {
        ...entry,
        analysis,
        insights,
        recommendations,
        quality_score: qualityScore,
        context_enrichment: contextEnrichment
      };

    } catch (error) {
      entry.duration_ms = Date.now() - startTime;
      throw error;
    }
  }

  private async analyzeThought(thought: string): Promise<ThoughtAnalysis> {
    // Simple analysis - in production this could use NLP
    const wordCount = thought.split(/\s+/).length;
    const sentenceCount = thought.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0;

    // Detect reasoning patterns
    const patterns = this.detectReasoningPatterns(thought);

    // Assess complexity
    const complexity = this.assessComplexity(thought, patterns);

    return {
      word_count: wordCount,
      sentence_count: sentenceCount,
      avg_words_per_sentence: avgWordsPerSentence,
      reasoning_patterns: patterns,
      complexity_score: complexity,
      key_concepts: this.extractKeyConcepts(thought),
      emotional_indicators: this.detectEmotionalIndicators(thought)
    };
  }

  private async generateInsights(
    entry: ThinkingEntry,
    context: ToolExecutionContext
  ): Promise<string[]> {
    const insights: string[] = [];

    // Generate insights based on reasoning type
    switch (entry.reasoning_type) {
      case 'analysis':
        insights.push('Breaking down the problem into components reveals key relationships');
        break;
      case 'planning':
        insights.push('Sequential planning helps identify dependencies and risks');
        break;
      case 'problem_solving':
        insights.push('Multiple solution paths should be evaluated for effectiveness');
        break;
      case 'evaluation':
        insights.push('Criteria-based evaluation provides objective assessment');
        break;
      default:
        insights.push('Structured thinking improves decision quality');
    }

    // Add context-specific insights
    if (entry.assumptions.length > 0) {
      insights.push(`${entry.assumptions.length} assumptions identified - validate these before proceeding`);
    }

    if (entry.alternatives_considered.length > 0) {
      insights.push(`${entry.alternatives_considered.length} alternatives considered - shows thorough analysis`);
    }

    return insights;
  }

  private async generateRecommendations(
    entry: ThinkingEntry,
    insights: string[]
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Confidence-based recommendations
    if (entry.confidence_level < 0.7) {
      recommendations.push('Consider gathering more information to increase confidence');
    }

    // Next steps recommendations
    if (entry.next_steps.length === 0) {
      recommendations.push('Define specific next steps to maintain momentum');
    }

    // Assumption validation
    if (entry.assumptions.length > 3) {
      recommendations.push('Validate key assumptions before proceeding with implementation');
    }

    // Context dependency recommendations
    if (entry.context_dependencies.length > 0) {
      recommendations.push('Ensure all context dependencies are available and current');
    }

    return recommendations;
  }

  private assessThinkingQuality(
    entry: ThinkingEntry,
    analysis: ThoughtAnalysis
  ): number {
    let score = 0.5; // Base score

    // Reward structured thinking
    if (analysis.reasoning_patterns.length > 0) score += 0.1;
    if (entry.next_steps.length > 0) score += 0.1;
    if (entry.alternatives_considered.length > 0) score += 0.15;

    // Reward thoroughness
    if (analysis.word_count > 50) score += 0.1;
    if (entry.assumptions.length > 0) score += 0.05;
    if (entry.context_dependencies.length > 0) score += 0.05;

    // Confidence alignment
    if (entry.confidence_level > 0.8 && analysis.complexity_score > 0.7) {
      score += 0.1; // High confidence with high complexity is good
    }

    return Math.min(1.0, score);
  }

  private async enrichWithContext(
    entry: ThinkingEntry,
    context: ToolExecutionContext
  ): Promise<JSONObject> {
    return {
      conversation_stage: this.determineConversationStage(context),
      previous_reasoning_types: this.getPreviousReasoningTypes(context.conversation_id),
      reasoning_depth: this.calculateReasoningDepth(entry),
      contextual_relevance: this.assessContextualRelevance(entry, context)
    };
  }

  // ============================================================================
  // THINKING SESSION MANAGEMENT
  // ============================================================================

  private updateThinkingSession(
    conversationId: string,
    thinking: ProcessedThinkingEntry
  ): void {
    let session = this.thinkingHistory.get(conversationId);

    if (!session) {
      session = {
        conversation_id: conversationId,
        started_at: new Date().toISOString(),
        thoughts: [],
        reasoning_patterns: [],
        total_thinking_time_ms: 0
      };
    }

    session.thoughts.push(thinking);
    session.total_thinking_time_ms += thinking.duration_ms;
    session.updated_at = new Date().toISOString();

    // Update reasoning patterns
    if (!session.reasoning_patterns.includes(thinking.reasoning_type)) {
      session.reasoning_patterns.push(thinking.reasoning_type);
    }

    // Limit session size (keep last 50 thoughts)
    if (session.thoughts.length > 50) {
      session.thoughts = session.thoughts.slice(-50);
    }

    this.thinkingHistory.set(conversationId, session);
  }

  private getSessionThoughtCount(conversationId: string): number {
    const session = this.thinkingHistory.get(conversationId);
    return session ? session.thoughts.length : 0;
  }

  private getReasoningChain(conversationId: string): string[] {
    const session = this.thinkingHistory.get(conversationId);
    if (!session) return [];

    return session.thoughts
      .slice(-5) // Last 5 thoughts
      .map(t => t.reasoning_type);
  }

  private getPreviousReasoningTypes(conversationId: string): string[] {
    const session = this.thinkingHistory.get(conversationId);
    return session ? session.reasoning_patterns : [];
  }

  // ============================================================================
  // ANALYSIS HELPERS
  // ============================================================================

  private detectReasoningPatterns(thought: string): string[] {
    const patterns: string[] = [];
    const lowerThought = thought.toLowerCase();

    // Causal reasoning
    if (/because|since|due to|caused by|results in/.test(lowerThought)) {
      patterns.push('causal_reasoning');
    }

    // Comparative reasoning
    if (/compared to|versus|better than|worse than|similar to/.test(lowerThought)) {
      patterns.push('comparative_reasoning');
    }

    // Conditional reasoning
    if (/if|then|unless|provided that|assuming/.test(lowerThought)) {
      patterns.push('conditional_reasoning');
    }

    // Sequential reasoning
    if (/first|then|next|finally|step by step/.test(lowerThought)) {
      patterns.push('sequential_reasoning');
    }

    return patterns;
  }

  private assessComplexity(thought: string, patterns: string[]): number {
    let complexity = 0.3; // Base complexity

    // Pattern complexity
    complexity += patterns.length * 0.1;

    // Sentence structure complexity
    const sentences = thought.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;

    if (avgLength > 100) complexity += 0.2;
    if (sentences.length > 3) complexity += 0.1;

    // Concept complexity
    const concepts = this.extractKeyConcepts(thought);
    complexity += concepts.length * 0.05;

    return Math.min(1.0, complexity);
  }

  private extractKeyConcepts(thought: string): string[] {
    // Simple keyword extraction - in production would use NLP
    const words = thought.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 4);

    // Remove common words
    const stopWords = new Set(['should', 'would', 'could', 'think', 'about', 'because', 'through']);
    return words.filter(word => !stopWords.has(word)).slice(0, 10);
  }

  private detectEmotionalIndicators(thought: string): string[] {
    const indicators: string[] = [];
    const lowerThought = thought.toLowerCase();

    if (/concern|worry|anxious|uncertain/.test(lowerThought)) {
      indicators.push('uncertainty');
    }
    if (/confident|sure|certain|believe/.test(lowerThought)) {
      indicators.push('confidence');
    }
    if (/excited|enthusiastic|optimistic/.test(lowerThought)) {
      indicators.push('positive');
    }

    return indicators;
  }

  private determineConversationStage(context: ToolExecutionContext): string {
    if (context.step_number <= 2) return 'early';
    if (context.step_number <= 5) return 'middle';
    return 'late';
  }

  private calculateReasoningDepth(entry: ThinkingEntry): number {
    let depth = 1; // Base depth

    if (entry.assumptions.length > 0) depth += 0.5;
    if (entry.alternatives_considered.length > 0) depth += 0.5;
    if (entry.context_dependencies.length > 0) depth += 0.3;

    return Math.min(3.0, depth);
  }

  private assessContextualRelevance(
    entry: ThinkingEntry,
    context: ToolExecutionContext
  ): number {
    // Simple relevance assessment
    let relevance = 0.5;

    if (entry.context_dependencies.length > 0) relevance += 0.2;
    if (entry.next_steps.length > 0) relevance += 0.2;
    if (entry.confidence_level > 0.7) relevance += 0.1;

    return Math.min(1.0, relevance);
  }

  private validateConfidence(confidence: any): number {
    if (typeof confidence === 'number' && confidence >= 0 && confidence <= 1) {
      return confidence;
    }
    return 0.5; // Default moderate confidence
  }

  private generateUUID(): UUID {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ============================================================================
  // PUBLIC UTILITY METHODS
  // ============================================================================

  /**
   * Get thinking session for a conversation
   */
  public getThinkingSession(conversationId: string): ThinkingSession | undefined {
    return this.thinkingHistory.get(conversationId);
  }

  /**
   * Clear thinking history for a conversation
   */
  public clearThinkingHistory(conversationId: string): void {
    this.thinkingHistory.delete(conversationId);
  }

  /**
   * Get thinking statistics
   */
  public getThinkingStats(): {
    total_sessions: number;
    total_thoughts: number;
    avg_thoughts_per_session: number;
    most_common_reasoning_types: Array<{type: string; count: number}>;
  } {
    const sessions = Array.from(this.thinkingHistory.values());
    const totalThoughts = sessions.reduce((sum, s) => sum + s.thoughts.length, 0);

    const reasoningTypeCounts: Record<string, number> = {};
    sessions.forEach(session => {
      session.thoughts.forEach(thought => {
        reasoningTypeCounts[thought.reasoning_type] =
          (reasoningTypeCounts[thought.reasoning_type] || 0) + 1;
      });
    });

    const sortedTypes = Object.entries(reasoningTypeCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    return {
      total_sessions: sessions.length,
      total_thoughts: totalThoughts,
      avg_thoughts_per_session: sessions.length > 0 ? totalThoughts / sessions.length : 0,
      most_common_reasoning_types: sortedTypes
    };
  }
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ThinkingEntry {
  id: UUID;
  timestamp: Timestamp;
  thought: string;
  reasoning_type: string;
  confidence_level: number;
  next_steps: string[];
  context_dependencies: string[];
  assumptions: string[];
  alternatives_considered: any[];
  metadata: JSONObject;
  step_number: number;
  duration_ms: number;
}

interface ProcessedThinkingEntry extends ThinkingEntry {
  analysis: ThoughtAnalysis;
  insights: string[];
  recommendations: string[];
  quality_score: number;
  context_enrichment: JSONObject;
}

interface ThoughtAnalysis {
  word_count: number;
  sentence_count: number;
  avg_words_per_sentence: number;
  reasoning_patterns: string[];
  complexity_score: number;
  key_concepts: string[];
  emotional_indicators: string[];
}

interface ThinkingSession {
  conversation_id: string;
  started_at: Timestamp;
  updated_at?: Timestamp;
  thoughts: ProcessedThinkingEntry[];
  reasoning_patterns: string[];
  total_thinking_time_ms: number;
}

// ============================================================================
// EXPORT
// ============================================================================

export default ThinkTool;

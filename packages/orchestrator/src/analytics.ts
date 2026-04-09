import { EventEmitter } from 'events';

export enum AnalyticsSink {
  datadog = 'datadog',
  firstParty = 'firstParty',
  growthbook = 'growthbook'
}

export interface EventMetadata {
  model: string
  sessionId: string
  userType: string
  betas: string[]
  isInteractive: boolean
  clientType: string
  platform: string
  arch: string
  nodeVersion: string
  terminal: string
  isRunningWithBun: boolean
  isCi: boolean
  agentId?: string
  parentSessionId?: string
  agentType?: string
  teamName?: string
}

export interface AnalyticsEvent {
  eventName: string
  timestamp: number
  properties: Record<string, unknown>
  metadata: EventMetadata
}

export interface SinkConfig {
  enabled: boolean
  endpoint?: string
  apiKey?: string
  flushIntervalMs?: number
  maxBatchSize?: number
  retryOptions?: {
    maxRetries: number
    retryDelayMs: number
    diskBacked: boolean
  }
  cacheOptions?: {
    ttlMs: number
    diskCache: boolean
  }
}

export interface SamplingConfig {
  rate: number
  minIntervalMs?: number
  adaptiveThreshold?: number
}

interface SinkInterface {
  initialize(): Promise<void>
  send(event: AnalyticsEvent): Promise<void>
  flush(): Promise<void>
  shutdown(): Promise<void>
}

class DatadogSink implements SinkInterface {
  private batch: AnalyticsEvent[] = []
  private flushInterval: ReturnType<typeof setInterval> | null = null
  private config: SinkConfig
  private host: string = 'agent-intake-us5.datadoghq.com'
  private port: number = 8125

  constructor(config: SinkConfig) {
    this.config = config
  }

  async initialize(): Promise<void> {
    const flushInterval = this.config.flushIntervalMs ?? 15000
    this.flushInterval = setInterval(() => this.flush(), flushInterval)
  }

  async send(event: AnalyticsEvent): Promise<void> {
    if (!this.config.enabled) return
    
    this.batch.push(event)
    const maxBatchSize = this.config.maxBatchSize ?? 50
    if (this.batch.length >= maxBatchSize) {
      await this.flush()
    }
  }

  async flush(): Promise<void> {
    if (this.batch.length === 0) return

    const eventsToSend = [...this.batch]
    this.batch = []

    const payload = {
      series: eventsToSend.map(event => ({
        metric: `tronagentic.${event.eventName}`,
        points: [[event.timestamp, 1]],
        tags: [
          `model:${event.metadata.model}`,
          `session:${event.metadata.sessionId}`,
          `userType:${event.metadata.userType}`,
          `platform:${event.metadata.platform}`,
          `isInteractive:${event.metadata.isInteractive}`,
          ...event.metadata.betas.map(b => `beta:${b}`),
          ...Object.entries(event.properties).map(([k, v]) => `${k}:${v}`)
        ],
        type: 'count'
      }))
    }

    try {
      const response = await fetch(`https://${this.host}/api/v1/series`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': this.config.apiKey ?? process.env.DATADOG_API_KEY ?? ''
        },
        body: JSON.stringify(payload)
      })
      if (!response.ok) {
        console.error('[DatadogSink] Failed to send events:', response.status)
      }
    } catch (error) {
      console.error('[DatadogSink] Error sending events:', error)
      this.batch = [...eventsToSend, ...this.batch]
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
    await this.flush()
  }
}

class FirstPartySink implements SinkInterface {
  private batch: AnalyticsEvent[] = []
  private flushInterval: ReturnType<typeof setInterval> | null = null
  private config: SinkConfig
  private diskQueue: AnalyticsEvent[] = []
  private queueFile: string = '/tmp/tronagentic_event_queue.json'

  constructor(config: SinkConfig) {
    this.config = config
  }

  async initialize(): Promise<void> {
    await this.loadDiskQueue()
    const flushInterval = this.config.flushIntervalMs ?? 15000
    this.flushInterval = setInterval(() => this.flush(), flushInterval)
  }

  private async loadDiskQueue(): Promise<void> {
    try {
      const fs = await import('fs/promises')
      const data = await fs.readFile(this.queueFile, 'utf-8')
      this.diskQueue = JSON.parse(data)
    } catch {
      this.diskQueue = []
    }
  }

  private async saveDiskQueue(): Promise<void> {
    try {
      const fs = await import('fs/promises')
      await fs.writeFile(this.queueFile, JSON.stringify(this.diskQueue))
    } catch (error) {
      console.error('[FirstPartySink] Failed to save disk queue:', error)
    }
  }

  async send(event: AnalyticsEvent): Promise<void> {
    if (!this.config.enabled) return
    
    this.batch.push(event)
    const maxBatchSize = this.config.maxBatchSize ?? 50
    if (this.batch.length >= maxBatchSize) {
      await this.flush()
    }
  }

  async flush(): Promise<void> {
    const allEvents = [...this.diskQueue, ...this.batch]
    if (allEvents.length === 0) return

    const eventsToSend = allEvents.slice(0, this.config.maxBatchSize ?? 50)
    this.batch = eventsToSend.length <= (this.config.maxBatchSize ?? 50) 
      ? [] 
      : this.batch.slice(this.config.maxBatchSize ?? 50)

    const endpoint = this.config.endpoint ?? '/api/event_logging/batch'
    const baseUrl = process.env.FIRST_PARTY_API_URL ?? 'http://localhost:3000'

    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ events: eventsToSend })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      this.diskQueue = allEvents.slice(eventsToSend.length)
      await this.saveDiskQueue()
    } catch (error) {
      console.error('[FirstPartySink] Failed to send events:', error)
      
      const maxRetries = this.config.retryOptions?.maxRetries ?? 3
      const retryDelay = this.config.retryOptions?.retryDelayMs ?? 1000
      
      let attempts = 0
      while (attempts < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempts)))
        try {
          const retryResponse = await fetch(`${baseUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events: eventsToSend })
          })
          if (retryResponse.ok) {
            this.diskQueue = allEvents.slice(eventsToSend.length)
            await this.saveDiskQueue()
            return
          }
        } catch {
          // continue retrying
        }
        attempts++
      }

      if (this.config.retryOptions?.diskBacked ?? true) {
        this.diskQueue = [...this.diskQueue, ...eventsToSend]
        await this.saveDiskQueue()
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
    await this.flush()
  }
}

interface FeatureFlag {
  key: string
  value: boolean
  attributes?: Record<string, unknown>
}

class GrowthBookSink implements SinkInterface {
  private config: SinkConfig
  private flags: Map<string, boolean> = new Map()
  private lastRefresh: number = 0
  private refreshInterval: ReturnType<typeof setInterval> | null = null
  private diskCacheFile: string = '/tmp/tronagentic_feature_flags.json'

  constructor(config: SinkConfig) {
    this.config = config
  }

  async initialize(): Promise<void> {
    await this.loadDiskCache()
    await this.refreshFlags()
    
    const ttl = this.config.cacheOptions?.ttlMs ?? 20 * 60 * 1000
    this.refreshInterval = setInterval(() => this.refreshFlags(), ttl)
  }

  private async loadDiskCache(): Promise<void> {
    try {
      const fs = await import('fs/promises')
      const data = await fs.readFile(this.diskCacheFile, 'utf-8')
      const cached: Record<string, boolean> = JSON.parse(data)
      this.flags = new Map(Object.entries(cached))
    } catch {
      // No cache exists yet
    }
  }

  private async saveDiskCache(): Promise<void> {
    if (!this.config.cacheOptions?.diskCache) return
    try {
      const fs = await import('fs/promises')
      const data = JSON.stringify(Object.fromEntries(this.flags))
      await fs.writeFile(this.diskCacheFile, data)
    } catch (error) {
      console.error('[GrowthBookSink] Failed to save disk cache:', error)
    }
  }

  private async refreshFlags(): Promise<void> {
    const endpoint = this.config.endpoint ?? 'https://cdn.growthbook.io/api/features'
    const apiKey = this.config.apiKey ?? process.env.GROWTHBOOK_API_KEY ?? ''

    try {
      const response = await fetch(`${endpoint}?key=${apiKey}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })

      if (response.ok) {
        const data = await response.json() as { features?: Record<string, { defaultValue?: boolean }> }
        if (data.features) {
          for (const [key, flag] of Object.entries(data.features)) {
            this.flags.set(key, flag.defaultValue ?? false)
          }
          this.lastRefresh = Date.now()
          await this.saveDiskCache()
        }
      }
    } catch (error) {
      console.error('[GrowthBookSink] Failed to refresh flags:', error)
    }
  }

  async send(event: AnalyticsEvent): Promise<void> {
    // GrowthBookSink primarily handles feature flags, but can also log events
    if (!this.config.enabled) return
  }

  getFlag(key: string): boolean {
    return this.flags.get(key) ?? false
  }

  async flush(): Promise<void> {
    // No batch flushing needed for feature flags
  }

  async shutdown(): Promise<void> {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval)
      this.refreshInterval = null
    }
  }
}

class EventSampler {
  private samplingRates: Map<string, number> = new Map()
  private lastSampleTime: Map<string, number> = new Map()
  private highVolumeEvents: Set<string> = new Set([
    'token_usage',
    'tool_execution',
    'step_completed'
  ])

  setSamplingRate(eventType: string, rate: number): void {
    this.samplingRates.set(eventType, rate)
  }

  setHighVolumeEvent(eventType: string): void {
    this.highVolumeEvents.add(eventType)
  }

  shouldSample(eventType: string): boolean {
    const rate = this.samplingRates.get(eventType)
    if (rate === undefined) {
      if (this.highVolumeEvents.has(eventType)) {
        return this.sampleByRate(0.1)
      }
      return true
    }
    return this.sampleByRate(rate)
  }

  private sampleByRate(rate: number): boolean {
    return Math.random() < rate
  }

  shouldSampleAdaptive(eventType: string, currentVolume: number): boolean {
    const minInterval = 5000
    const lastTime = this.lastSampleTime.get(eventType) ?? 0
    const now = Date.now()

    if (now - lastTime < minInterval) {
      return false
    }

    this.lastSampleTime.set(eventType, now)

    if (currentVolume > 100) {
      return this.sampleByRate(0.01)
    } else if (currentVolume > 50) {
      return this.sampleByRate(0.05)
    }

    return this.sampleByRate(this.samplingRates.get(eventType) ?? 1)
  }
}

class AnalyticsService extends EventEmitter {
  private sinks: Map<AnalyticsSink, SinkInterface> = new Map()
  private killswitches: Map<AnalyticsSink, boolean> = new Map()
  private sinkConfigs: Map<AnalyticsSink, SinkConfig> = new Map()
  private sampler: EventSampler
  private growthBookSink?: GrowthBookSink

  constructor() {
    super()
    this.sampler = new EventSampler()
    this.initializeKillswitches()
    this.initializeSinks()
  }

  private initializeKillswitches(): void {
    const configEnv = process.env.tronagentic_analytics_boric
    let killswitchConfig: Record<string, boolean> = {}

    if (configEnv) {
      try {
        killswitchConfig = JSON.parse(configEnv)
      } catch {
        console.warn('[AnalyticsService] Invalid killswitch config, using defaults')
      }
    }

    this.killswitches.set(AnalyticsSink.datadog, killswitchConfig.datadog ?? true)
    this.killswitches.set(AnalyticsSink.firstParty, killswitchConfig.firstParty ?? true)
    this.killswitches.set(AnalyticsSink.growthbook, killswitchConfig.growthbook ?? true)
  }

  private initializeSinks(): void {
    const datadogConfig: SinkConfig = {
      enabled: this.killswitches.get(AnalyticsSink.datadog) ?? true,
      apiKey: process.env.DATADOG_API_KEY,
      flushIntervalMs: 15000,
      maxBatchSize: 50
    }
    this.sinkConfigs.set(AnalyticsSink.datadog, datadogConfig)
    this.sinks.set(AnalyticsSink.datadog, new DatadogSink(datadogConfig))

    const firstPartyConfig: SinkConfig = {
      enabled: this.killswitches.get(AnalyticsSink.firstParty) ?? true,
      endpoint: process.env.FIRST_PARTY_ENDPOINT,
      flushIntervalMs: 15000,
      maxBatchSize: 50,
      retryOptions: {
        maxRetries: 3,
        retryDelayMs: 1000,
        diskBacked: true
      }
    }
    this.sinkConfigs.set(AnalyticsSink.firstParty, firstPartyConfig)
    this.sinks.set(AnalyticsSink.firstParty, new FirstPartySink(firstPartyConfig))

    const growthbookConfig: SinkConfig = {
      enabled: this.killswitches.get(AnalyticsSink.growthbook) ?? true,
      endpoint: process.env.GROWTHBOOK_ENDPOINT,
      apiKey: process.env.GROWTHBOOK_API_KEY,
      cacheOptions: {
        ttlMs: 20 * 60 * 1000,
        diskCache: true
      }
    }
    this.sinkConfigs.set(AnalyticsSink.growthbook, growthbookConfig)
    const growthBookSink = new GrowthBookSink(growthbookConfig)
    this.sinks.set(AnalyticsSink.growthbook, growthBookSink)
    this.growthBookSink = growthBookSink
  }

  async initialize(): Promise<void> {
    const initPromises = Array.from(this.sinks.values()).map(sink => sink.initialize())
    await Promise.all(initPromises)
  }

  async logEvent(event: AnalyticsEvent): Promise<void> {
    if (!this.sampler.shouldSample(event.eventName)) {
      this.emit('sampled', event)
      return
    }

    const sinkPromises = Array.from(this.sinks.entries()).map(async ([sink, instance]) => {
      if (this.getKillswitch(sink)) {
        try {
          await instance.send(event)
        } catch (error) {
          this.emit('error', { sink, error })
        }
      }
    })

    await Promise.all(sinkPromises)
    this.emit('logged', event)
  }

  async flush(): Promise<void> {
    const flushPromises = Array.from(this.sinks.values()).map(sink => sink.flush())
    await Promise.all(flushPromises)
    this.emit('flushed')
  }

  setKillswitch(sink: AnalyticsSink, enabled: boolean): void {
    this.killswitches.set(sink, enabled)
    const config = this.sinkConfigs.get(sink)
    if (config) {
      config.enabled = enabled
    }
  }

  getKillswitch(sink: AnalyticsSink): boolean {
    return this.killswitches.get(sink) ?? true
  }

  getConfig(sink: AnalyticsSink): SinkConfig {
    return this.sinkConfigs.get(sink) ?? { enabled: true }
  }

  getGrowthBookFlag(key: string): boolean {
    return this.growthBookSink?.getFlag(key) ?? false
  }

  setSamplingRate(eventType: string, rate: number): void {
    this.sampler.setSamplingRate(eventType, rate)
  }

  async shutdown(): Promise<void> {
    const shutdownPromises = Array.from(this.sinks.values()).map(sink => sink.shutdown())
    await Promise.all(shutdownPromises)
    this.emit('shutdown')
  }
}

let analyticsServiceInstance: AnalyticsService | null = null

export function getAnalyticsService(): AnalyticsService {
  if (!analyticsServiceInstance) {
    analyticsServiceInstance = new AnalyticsService()
  }
  return analyticsServiceInstance
}

export { AnalyticsService, EventSampler, DatadogSink, FirstPartySink, GrowthBookSink }

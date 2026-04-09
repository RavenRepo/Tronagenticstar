import { EventEmitter } from 'eventemitter3';
import type { Readable } from 'stream';

export enum STTProvider {
  DEEPGRAM = 'deepgram',
  ANTHROPIC = 'anthropic',
  NOVA = 'nova'
}

export interface VoiceConfig {
  provider: STTProvider;
  apiKey: string;
  sampleRate: number;
  encoding: 'pcm_s16le';
  channels: number;
  model?: string;
}

export interface TranscriptResult {
  text: string;
  isFinal: boolean;
  confidence: number;
  words?: { word: string; start: number; end: number }[];
  provider: STTProvider;
}

interface ProtocolMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

interface KeepAliveMessage extends ProtocolMessage {
  type: 'keepalive';
  payload: { ping: true };
}

interface AudioChunkMessage extends ProtocolMessage {
  type: 'audio_chunk';
  payload: { data: string };
}

interface TranscriptTextMessage extends ProtocolMessage {
  type: 'transcript_text';
  payload: {
    text: string;
    isFinal: boolean;
    confidence: number;
    words?: { word: string; start: number; end: number }[];
  };
}

interface TranscriptEndpointMessage extends ProtocolMessage {
  type: 'transcript_endpoint';
  payload: { reason: 'silence' | 'timeout' | 'manual' };
}

type MessageHandlers = {
  keepalive: (payload: KeepAliveMessage['payload']) => void;
  audio_chunk: (payload: AudioChunkMessage['payload']) => void;
  transcript_text: (payload: TranscriptTextMessage['payload']) => void;
  transcript_endpoint: (payload: TranscriptEndpointMessage['payload']) => void;
};

const WS_OPEN = 1;

export class VoiceSTTService extends EventEmitter {
  private ws: unknown = null;
  private wsOpen: boolean = false;
  private audioBuffer: Buffer[] = [];
  private config: VoiceConfig | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private messageHandlers: Partial<MessageHandlers> = {};

  constructor() {
    super();
  }

  async connect(config: VoiceConfig): Promise<void> {
    this.config = {
      ...config,
      sampleRate: config.sampleRate || 16000,
      encoding: config.encoding || 'pcm_s16le',
      channels: config.channels || 1,
    };

    await this.establishConnection();
  }

  private async establishConnection(): Promise<void> {
    if (!this.config) throw new Error('No configuration provided');

    const wsUrl = this.buildWebSocketUrl();
    const WebSocketModule = await import('ws');
    const WebSocketClass = WebSocketModule.default;

    return new Promise((resolve, reject) => {
      const ws = new WebSocketClass(wsUrl, {
        headers: {
          'Authorization': `Bearer ${this.config!.apiKey}`
        }
      });
      this.ws = ws;

      ws.on('open', () => {
        this.wsOpen = true;
        this.reconnectAttempts = 0;
        this.startKeepAlive();
        this.setupMessageHandlers();
        resolve();
      });

      ws.on('message', (data: unknown) => {
        const rawData = data as { type: string; data: string };
        this.handleMessage(rawData);
      });

      ws.on('error', (error: unknown) => {
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
        reject(error);
      });

      ws.on('close', () => {
        this.wsOpen = false;
        this.handleDisconnect();
      });
    });
  }

  private buildWebSocketUrl(): string {
    if (!this.config) throw new Error('No configuration');

    const baseUrls: Record<STTProvider, string> = {
      [STTProvider.DEEPGRAM]: 'wss://api.deepgram.com/v1/listen',
      [STTProvider.ANTHROPIC]: 'wss://api.anthropic.com/v1/audio/transcribe',
      [STTProvider.NOVA]: 'wss://api.nova.ai/v1/transcribe'
    };

    const baseUrl = baseUrls[this.config.provider];
    const params = new URLSearchParams({
      sample_rate: this.config.sampleRate.toString(),
      encoding: this.config.encoding,
      channels: this.config.channels.toString()
    });

    if (this.config.model) {
      params.append('model', this.config.model);
    }

    return `${baseUrl}?${params.toString()}`;
  }

  private setupMessageHandlers(): void {
    this.messageHandlers = {
      keepalive: () => {
        this.sendKeepAliveResponse();
      },
      transcript_text: (payload) => {
        const result: TranscriptResult = {
          text: payload.text,
          isFinal: payload.isFinal,
          confidence: payload.confidence,
          words: payload.words,
          provider: this.config!.provider
        };
        this.emit('transcript', result);
      },
      transcript_endpoint: (payload) => {
        this.emit('endpoint', payload);
      }
    };
  }

  private handleMessage(data: { type: string; data: string }): void {
    try {
      const message: ProtocolMessage = JSON.parse(data.toString());
      const handler = this.messageHandlers[message.type as keyof MessageHandlers];
      if (handler) {
        (handler as (payload: unknown) => void)(message.payload);
      }
    } catch (error) {
      this.emit('error', new Error(`Failed to parse message: ${error}`));
    }
  }

  private startKeepAlive(): void {
    this.keepAliveInterval = setInterval(() => {
      this.sendKeepAlive();
    }, 30000);
  }

  private sendKeepAlive(): void {
    if (this.ws && this.wsOpen) {
      (this.ws as { send: (data: string) => void }).send(JSON.stringify({
        type: 'keepalive',
        payload: { ping: true },
        timestamp: Date.now()
      }));
    }
  }

  private sendKeepAliveResponse(): void {
    if (this.ws && this.wsOpen) {
      (this.ws as { send: (data: string) => void }).send(JSON.stringify({
        type: 'keepalive',
        payload: { pong: true },
        timestamp: Date.now()
      }));
    }
  }

  async disconnect(): Promise<void> {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    if (this.ws) {
      (this.ws as { close: () => void }).close();
      this.ws = null;
      this.wsOpen = false;
    }

    this.audioBuffer = [];
  }

  async sendAudioChunk(audioData: Buffer): Promise<void> {
    if (!this.ws || !this.wsOpen) {
      throw new Error('WebSocket not connected');
    }

    this.audioBuffer.push(audioData);

    const message: AudioChunkMessage = {
      type: 'audio_chunk',
      payload: {
        data: audioData.toString('base64')
      },
      timestamp: Date.now()
    };

    (this.ws as { send: (data: string) => void }).send(JSON.stringify(message));
  }

  async sendTranscript(text: string): Promise<void> {
    if (!this.ws || !this.wsOpen) {
      throw new Error('WebSocket not connected');
    }

    const message: TranscriptTextMessage = {
      type: 'transcript_text',
      payload: {
        text,
        isFinal: true,
        confidence: 1.0
      },
      timestamp: Date.now()
    };

    (this.ws as { send: (data: string) => void }).send(JSON.stringify(message));
  }

  onTranscript(callback: (transcript: TranscriptResult) => void): void {
    this.on('transcript', callback);
  }

  onError(callback: (error: Error) => void): void {
    this.on('error', callback);
  }

  onEndpoint(callback: (reason: TranscriptEndpointMessage['payload']) => void): void {
    this.on('endpoint', callback);
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.establishConnection().catch((err) => {
          this.emit('error', err);
        });
      }, Math.pow(2, this.reconnectAttempts) * 1000);
    } else {
      this.emit('error', new Error('Max reconnection attempts reached'));
    }
  }

  getProvider(): STTProvider | null {
    return this.config?.provider || null;
  }

  isConnected(): boolean {
    return this.wsOpen;
  }
}

export function createVoiceSTTService(): VoiceSTTService {
  return new VoiceSTTService();
}
import { connect, NatsConnection, StringCodec } from "nats";

export interface ErrorGoldOptions {
  natsUrl?: string; // default nats://localhost:4222
  subject?: string; // default errorgold.events
}

export class ErrorGold {
  private ncPromise: Promise<NatsConnection>;
  private subject: string;
  private readonly sc = StringCodec();

  constructor(opts: ErrorGoldOptions = {}) {
    const url = opts.natsUrl ?? process.env.NATS_URL ?? "nats://localhost:4222";
    this.subject = opts.subject ?? "errorgold.events";
    this.ncPromise = connect({ servers: url });
  }

  async capture(error: unknown, context: Record<string, unknown> = {}): Promise<void> {
    const payload = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
      timestamp: new Date().toISOString(),
    };

    const nc = await this.ncPromise;
    nc.publish(this.subject, this.sc.encode(JSON.stringify(payload)));
  }

  async close(): Promise<void> {
    const nc = await this.ncPromise;
    await nc.drain();
  }
} 
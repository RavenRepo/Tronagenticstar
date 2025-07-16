import { describe, it, expect, vi } from "vitest";
import * as nats from "nats";
import { ErrorGold } from "../src/index.js";

describe("ErrorGold SDK", () => {
  it("publishes error payload to NATS", async () => {
    const publishMock = vi.fn();
    const drainMock = vi.fn();
    const mockNc = { publish: publishMock, drain: drainMock } as unknown as nats.NatsConnection;

    vi.spyOn(nats, "connect").mockResolvedValueOnce(mockNc);

    const eg = new ErrorGold({ natsUrl: "nats://test:4222" });
    await eg.capture(new Error("boom"), { foo: "bar" });
    expect(publishMock).toHaveBeenCalledOnce();

    await eg.close();
    expect(drainMock).toHaveBeenCalled();
  });
}); 
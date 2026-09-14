import { afterEach, describe, expect, it, vi } from "vitest";
import { getMayanAddressActivity } from "../src/bridge/mayan.js";

const address = "0x000000000000000000000000000000000000dEaD";

describe("Mayan Explorer bridge activity", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes a Mayan swap while retaining the full provider response", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({
      data: [{ orderId: "SWIFT_1", clientStatus: "COMPLETED", status: "ORDER_UNLOCKED", sourceChain: "4", destChain: "2", swapChain: "1", fromTokenAddress: "0xfrom", fromTokenSymbol: "USDT", fromAmount: "10", toTokenAddress: "0xto", toTokenSymbol: "ETH", toAmount: "0.003", destAddress: address, sourceTxHash: "0xsource", orderHash: "0xorder", initiatedAt: "2026-01-01T00:00:00.000Z" }],
      metadata: { count: 1, volume: 10 },
    }), { status: 200 }));
    const result = await getMayanAddressActivity({ address, limit: 50, offset: 0 });
    expect(result).toMatchObject({ provider: "mayan", activityCount: 1, pagination: { total: "1" }, volume: "10", activities: [{ id: "SWIFT_1", status: "COMPLETED", providerStatus: "ORDER_UNLOCKED", source: { chainId: "4" }, destination: { chainId: "2", amount: "0.003" } }], raw: { metadata: { count: 1 } } });
  });
});

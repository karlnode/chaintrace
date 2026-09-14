import { afterEach, describe, expect, it, vi } from "vitest";
import { getLifiAddressActivity } from "../src/bridge/lifi.js";

const address = "0x000000000000000000000000000000000000dEaD";

describe("LI.FI Orders bridge activity", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes a LI.FI order while retaining the full provider response", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({
      data: [{
        order: { originChainId: "56", outputs: [{ chainId: "1", recipient: address }] },
        quote: { quoteId: "quote-1", fromAssetAddress: "0xfrom", toAssetAddress: "0xto", fromAssetDecimals: 18, toAssetDecimals: 6 },
        meta: { orderIdentifier: "intent-1", orderStatus: "Settled", sendingTokenAmount: "10", receivingTokenAmount: "9", orderInitiatedTxHash: "0xsource", orderDeliveredTxHash: "0xdestination", orderSettledTxHash: "0xsettled", signedAt: "2026-01-01T00:00:00.000Z" },
      }], meta: { total: 1, limit: 50, offset: 0 },
    }), { status: 200 }));
    const result = await getLifiAddressActivity({ address, limit: 50, offset: 0 });
    expect(result).toMatchObject({ provider: "lifi-orders", activityCount: 1, pagination: { total: "1" }, activities: [{ id: "intent-1", status: "Settled", source: { chainId: "56", amount: "10" }, destination: { chainId: "1", amount: "9" } }], raw: { meta: { total: 1 } } });
  });

  it("caps LI.FI's request to the documented 50-record limit", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [], meta: { total: 0, limit: 50, offset: 0 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await getLifiAddressActivity({ address, limit: 100, offset: 0 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("limit=50");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { getAcrossAddressActivity } from "../src/bridge/across.js";

const address = "0x000000000000000000000000000000000000dEaD";

describe("Across bridge activity", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses Across v4 and normalizes transfer records", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      transfers: [{ ref: "0xref", depositId: "1", status: "filled", origin: { chainId: 137, token: { address: "0xfrom" }, amount: "100" }, destination: { chainId: 56, token: { address: "0xto" }, amount: "99", address }, deposit: { txHash: "0xdeposit", timestamp: "2026-01-01T00:00:00.000Z" }, fill: { txHash: "0xfill", timestamp: "2026-01-01T00:00:01.000Z" }, bridgeFeeUsd: "0.01" }],
      nextCursor: "next",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getAcrossAddressActivity({ address, limit: 100, offset: 0 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("source=v4");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("limit=100");
    expect(result).toMatchObject({ provider: "across", activityCount: 1, pagination: { nextCursor: "next" }, activities: [{ id: "0xref", status: "filled", source: { chainId: "137", amount: "100" }, destination: { chainId: "56", amount: "99", deliveryTransactionHash: "0xfill" } }], raw: { nextCursor: "next" } });
  });
});

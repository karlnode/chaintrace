import { afterEach, describe, expect, it, vi } from "vitest";
import { createChainstackTraceClient, summarizeTrace } from "../src/evm/chainstack.js";
import { ToolError } from "../src/shared/errors.js";

const hash = `0x${"a".repeat(64)}`;

describe("Chainstack tracing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the documented trace_transaction request and normalizes flat internal calls", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toMatchObject({ method: "trace_transaction", params: [hash] });
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: [{
        type: "call", action: { from: "0xfrom", to: "0xto", value: "0xde0b6b3a7640000", gas: "0x10" }, result: { gasUsed: "0x8" }, traceAddress: [],
      }, { type: "call", action: { callType: "delegatecall", from: "0xto", to: "0ximpl", value: "0x0" }, traceAddress: [0] }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const trace = await createChainstackTraceClient({}).trace("base-mainnet", hash);
    expect(trace).toMatchObject({ endpointNetwork: "base-mainnet", method: "trace_transaction" });
    expect(summarizeTrace(trace.result)).toMatchObject([{ depth: 0, valueWei: "1000000000000000000" }, { depth: 1, callType: "delegatecall", to: "0ximpl" }]);
  });

  it("rejects chains without Chainstack debug and trace support before contacting RPC", async () => {
    await expect(createChainstackTraceClient({}).trace("arbitrum-mainnet", hash))
      .rejects.toMatchObject<ToolError>({ code: "TRACE_NOT_AVAILABLE" });
  });
});

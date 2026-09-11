export class ToolError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "ToolError";
  }
}

export function asToolError(error: unknown): ToolError {
  if (error instanceof ToolError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new ToolError(`Solana RPC request failed: ${message}`, "RPC_ERROR");
}

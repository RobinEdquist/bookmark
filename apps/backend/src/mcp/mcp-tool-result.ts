import { HttpException, Logger } from '@nestjs/common';
import type {
  CallToolResult,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';

const logger = new Logger('McpTools');

export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** Read-only, but asks an outside service whose answers change over time. */
export const READ_ONLY_EXTERNAL: ToolAnnotations = {
  ...READ_ONLY,
  openWorldHint: true,
};

/** Replaces values that are there now. Repeating it changes nothing more. */
export const OVERWRITES: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

/** Only adds; nothing that exists is changed. */
export const ADDS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

/** Runs a tool and returns its result as compact JSON text. */
export function jsonResult(fn: () => Promise<object>): Promise<CallToolResult> {
  return runTool(async () => ({
    content: [{ type: 'text', text: JSON.stringify(await fn()) }],
  }));
}

/**
 * Turns failures into tool errors the agent can read. Expected failures
 * (refused, not found, bad input) keep their message; anything else is
 * logged and reported without internals such as SQL.
 */
export async function runTool(
  fn: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpException) {
      return toolError(error.message);
    }
    logger.error('MCP tool failed', error);
    return toolError('The tool failed on the server.');
  }
}

function toolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

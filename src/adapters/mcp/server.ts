import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ServiceError } from "../../service/errors.ts";
import { TOOLS, callTool } from "./tools.ts";
import type { Principal, ServiceContext } from "../../service/context.ts";

/**
 * The MCP adapter. It calls the same service functions the HTTP adapter calls.
 * It never makes an HTTP request back to the API. One implementation serves
 * two surfaces, so the two cannot drift apart (ADR 4).
 */
export function createMcpServer(
  ctx: ServiceContext,
  principal: Principal,
): Server {
  const server = new Server(
    { name: "todo", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = callTool(ctx, principal, name, args ?? {});
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (error) {
      if (error instanceof ServiceError) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `${error.code}: ${error.message}`,
            },
          ],
        };
      }
      throw error;
    }
  });

  return server;
}

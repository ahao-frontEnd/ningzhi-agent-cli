import {
  initializeMcpClients,
  disconnectAllMcpClients,
  type McpServerConnection,
} from "./client";
import { wrapMcpTool } from "./wrapper";
import type { NingzhiTool } from "../tools";

let mcpConnections: McpServerConnection[] = [];
let mcpTools: NingzhiTool[] = [];

export async function initMcpTools(): Promise<NingzhiTool[]> {
  mcpConnections = await initializeMcpClients();
  mcpTools = [];
  for (const conn of mcpConnections) {
    for (const mcpTool of conn.tools) {
      mcpTools.push(wrapMcpTool(conn, mcpTool));
    }
  }
  return mcpTools;
}

export function getMcpTools(): NingzhiTool[] {
  return mcpTools;
}

export async function shutdownMcp(): Promise<void> {
  await disconnectAllMcpClients(mcpConnections);
  mcpConnections = [];
  mcpTools = [];
}

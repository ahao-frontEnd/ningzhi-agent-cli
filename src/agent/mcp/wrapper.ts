import { tool } from "@langchain/core/tools";
import { callMcpTool, type McpServerConnection } from "./client";
import type { NingzhiTool } from "../tools";

const MCP_TOOL_PERMISSION_LEVEL = "mcp";

export function wrapMcpTool(
  connection: McpServerConnection,
  mcpTool: { name: string; description?: string; inputSchema: object },
): NingzhiTool {
  const prefixedName = `${connection.name}_${mcpTool.name}`;
  // 描述信息：前缀标记来源服务器 + 原始描述
  const description = `[MCP:${connection.name}] ${mcpTool.description || "No description"}`;

  // 直接把 MCP 工具的 inputSchema（JSON Schema）传给 LangChain 作为参数 schema。
  // 这样 LLM 能看到完整的参数定义（如 url 字段），而不是空 schema。
  // LangChain 支持 JSON Schema，会用 @cfworker/json-schema 做参数校验。
  const schema = mcpTool.inputSchema;

  const impl = async (args: Record<string, unknown>) => {
    const result = await callMcpTool(connection.client, mcpTool.name, args);
    return result;
  };

  const t = tool(impl, {
    name: prefixedName,
    description,
    schema,
  }) as unknown as NingzhiTool;

  t.permission_level = MCP_TOOL_PERMISSION_LEVEL;
  return t;
}

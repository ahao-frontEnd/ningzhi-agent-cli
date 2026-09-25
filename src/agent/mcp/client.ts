import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { color } from "../colors";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema: object;
}

export interface McpServerConnection {
  name: string;
  client: Client;
  transport: StdioClientTransport;
  tools: McpToolInfo[];
}

const CONFIG_PATH = join(__dirname, "mcp.json");
const CONNECT_TIMEOUT_MS = 60000;

export function loadMcpConfig(): Record<string, McpServerConfig> {
  try {
    const content = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(content);
    if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
      console.warn(
        color.warn('[MCP] mcp.json missing "mcpServers" field, skipping'),
      );
      return {};
    }
    return parsed.mcpServers as Record<string, McpServerConfig>;
  } catch (err: any) {
    // `ENOENT` 是 Node.js 中一个标准的系统错误码，全称是 Error NO ENTry （无此条目/文件不存在）
    // 当调用`readFileSync` 时，如果`mcp.json` 文件 不存在 ，
    // Node.js 会抛出一个带有`err.code === "ENOENT"` 的错误。
    if (err.code === "ENOENT") {
      return {}; // 文件不存在 → 返回空配置，静默跳过
    }
    console.warn(
      color.warn(`[MCP] Failed to load mcp.json: ${err.message}, skipping`),
    );
    return {};
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

export async function connectMcpServer(
  name: string,
  config: McpServerConfig,
): Promise<McpServerConnection> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env,
  });

  const client = new Client(
    { name: "ningzhi", version: "0.0.1" },
    { capabilities: {} },
  );

  await withTimeout(
    client.connect(transport),
    CONNECT_TIMEOUT_MS,
    `MCP server "${name}" connect`,
  );

  const toolsResult = await withTimeout(
    client.listTools(),
    CONNECT_TIMEOUT_MS,
    `MCP server "${name}" listTools`,
  );

  const tools: McpToolInfo[] = (toolsResult.tools || []).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as object,
  }));

  return { name, client, transport, tools };
}

// 初始化 MCP 客户端连接，根据配置文件中的服务器列表连接到所有 MCP 服务器。
// @returns 已连接的 MCP 服务器连接列表。
export async function initializeMcpClients(): Promise<McpServerConnection[]> {
  const config = loadMcpConfig();
  const entries = Object.entries(config); // [ [ "playwright", {...} ], [ "key", {...} ] ]

  if (entries.length === 0) {
    return [];
  }

  console.log(color.info(`[MCP] Connecting to ${entries.length} server(s)...`));

  // allSettled 它会 等待所有传入的 Promise 都完成 （无论成功还是失败），然后返回一个结果数组。
  const results = await Promise.allSettled(
    entries.map(([name, cfg]) =>
      connectMcpServer(name, cfg).catch((err) => {
        const msg = err.message || "";
        const hint = msg.includes("timed out")
          ? " (Hint: if using npx, the first run may need to download the package. Consider pre-installing with `npm install -g <package>` or increasing timeout.)"
          : "";
        console.error(
          color.error(`[MCP] Failed to connect "${name}": ${msg}${hint}`),
        );
        throw err;
      }),
    ),
  );

  const connections: McpServerConnection[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      const conn = result.value;
      console.log(
        color.good(
          `[MCP] Connected "${conn.name}" with ${conn.tools.length} tool(s)`,
        ),
      );
      connections.push(conn);
    } else {
      console.error(
        color.error(`[MCP] Skipped "${entries[i][0]}" due to connection error`),
      );
    }
  }

  return connections;
}

/**
 * 调用指定 MCP 服务器上的工具，返回工具输出的文本内容。
 * @param client 已连接的 MCP 客户端
 * @param name   工具名称
 * @param args   传给工具的参数
 */
export async function callMcpTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  // 向 MCP 服务器发起 tool call 请求
  const result = await client.callTool({ name, arguments: args });

  // MCP 协议中 isError 为 true 表示工具执行失败，需抛出错误让上层处理
  if ((result as any).isError) {
    const text = extractTextFromResult(result);
    throw new Error(text || `MCP tool "${name}" returned an error`);
  }

  // 成功时，从返回结果中提取文本内容（可能有多段 text，用换行拼接）
  return extractTextFromResult(result);
}

// 从 MCP 服务器返回的工具调用结果中提取文本内容（可能有多段 text，用换行拼接）
function extractTextFromResult(result: any): string {
  //   如果结果中没有 content 字段，返回原始结果
  if (!result.content || !Array.isArray(result.content)) {
    return JSON.stringify(result);
  }
  //   从结果中提取所有 text 类型的项，将它们的文本内容用换行拼接起来
  const texts: string[] = [];
  for (const item of result.content) {
    if (item.type === "text" && typeof item.text === "string") {
      texts.push(item.text);
    }
  }
  //   如果结果中没有 text 类型的项，返回原始结果
  if (texts.length === 0) {
    return JSON.stringify(result);
  }
  //   否则，返回所有 text 类型项的文本内容，用换行拼接
  return texts.join("\n");
}

export async function disconnectAllMcpClients(
  connections: McpServerConnection[],
): Promise<void> {
  await Promise.allSettled(
    connections.map(async (conn) => {
      try {
        await conn.transport.close();
      } catch {
        // ignore
      }
    }),
  );
}

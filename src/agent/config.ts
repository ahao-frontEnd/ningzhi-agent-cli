import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const WORKSPACE_DIR = path.join(os.homedir(), ".ningzhiAgentCli");
export const CONFIG_PATH = path.join(WORKSPACE_DIR, "ningzhi.json");

interface ModelConfig {
  model: string;
  apiKey: string;
  baseURL: string;
}

export interface HookConfig {
  matcher: string;
  command: string;
}

export interface HooksConfig {
  hooks: {
    PreToolUse?: HookConfig[];
    PostToolUse?: HookConfig[];
    SessionStart?: HookConfig[];
  };
}

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

interface NingzhiConfig {
  model?: ModelConfig;
  env?: Record<string, string>;
  hooks?: HooksConfig["hooks"];
  mcpServers?: Record<string, McpServerConfig>;
}

let cachedConfig: NingzhiConfig | null = null;

export function loadConfig(): NingzhiConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `找不到配置文件 ${CONFIG_PATH}\n\n请创建该文件并配置相关信息，例如：\n{\n  "model": {\n    "model": "kimi-k2.6",\n    "apiKey": "your-api-key",\n    "baseURL": "https://api.moonshot.cn/v1"\n  },\n  "env": {\n    "TAVILY_API_KEY": "your-tavily-api-key"\n  }\n}`,
    );
  }

  let config: NingzhiConfig;
  try {
    const content = fs.readFileSync(CONFIG_PATH, "utf-8");
    config = JSON.parse(content) as NingzhiConfig;
  } catch (e) {
    throw new Error(
      `配置文件 ${CONFIG_PATH} 解析失败：${e instanceof Error ? e.message : String(e)}`,
    );
  }

  cachedConfig = config;
  return config;
}

export function getModelConfig(): ModelConfig {
  const config = loadConfig();

  if (!config.model || typeof config.model !== "object") {
    throw new Error(
      `配置文件 ${CONFIG_PATH} 中缺少 model 对象，请参考 https://www.npmjs.com/package/ningzhi-agent-cli?activeTab=readme`,
    );
  }
  if (!config.model.model) {
    throw new Error(
      `配置文件 ${CONFIG_PATH} 中缺少 model.model 字段，请参考 https://www.npmjs.com/package/ningzhi-agent-cli?activeTab=readme`,
    );
  }
  if (!config.model.apiKey) {
    throw new Error(
      `配置文件 ${CONFIG_PATH} 中缺少 model.apiKey 字段，请参考 https://www.npmjs.com/package/ningzhi-agent-cli?activeTab=readme`,
    );
  }
  if (!config.model.baseURL) {
    throw new Error(
      `配置文件 ${CONFIG_PATH} 中缺少 model.baseURL 字段，请参考 https://www.npmjs.com/package/ningzhi-agent-cli?activeTab=readme`,
    );
  }

  return config.model;
}

export function getEnv(key: string): string | undefined {
  const config = loadConfig();
  return config.env?.[key];
}

export function getHooksConfig(): HooksConfig {
  try {
    const config = loadConfig();
    return { hooks: config.hooks || {} };
  } catch {
    return { hooks: {} };
  }
}

export function getMCPServerConfig(): Record<string, McpServerConfig> {
  try {
    const content = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(content) as NingzhiConfig;
    if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
      console.warn('[MCP] ningzhi.json missing "mcpServers" field, skipping');
      return {};
    }
    return parsed.mcpServers as Record<string, McpServerConfig>;
  } catch (err: any) {
    // `ENOENT` 是 Node.js 中一个标准的系统错误码，全称是 Error NO ENTry （无此条目/文件不存在）
    // 当调用`readFileSync` 时，如果`ningzhi.json` 文件 不存在 ，
    // Node.js 会抛出一个带有`err.code === "ENOENT"` 的错误。
    if (err.code === "ENOENT") {
      return {};
    }
    console.warn(`[MCP] Failed to load ningzhi.json: ${err.message}, skipping`);
    return {};
  }
}

export function clearConfigCache(): void {
  cachedConfig = null;
}

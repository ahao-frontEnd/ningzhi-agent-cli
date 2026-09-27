import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const CONFIG_DIR = path.join(os.homedir(), ".ningzhiAgentCli");
const CONFIG_PATH = path.join(CONFIG_DIR, "ningzhi.json");

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

interface NingzhiConfig {
  model?: ModelConfig;
  env?: Record<string, string>;
  hooks?: HooksConfig["hooks"];
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
    throw new Error(`配置文件 ${CONFIG_PATH} 中缺少 model 对象`);
  }
  if (!config.model.model) {
    throw new Error(`配置文件 ${CONFIG_PATH} 中缺少 model.model 字段`);
  }
  if (!config.model.apiKey) {
    throw new Error(`配置文件 ${CONFIG_PATH} 中缺少 model.apiKey 字段`);
  }
  if (!config.model.baseURL) {
    throw new Error(`配置文件 ${CONFIG_PATH} 中缺少 model.baseURL 字段`);
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

export function clearConfigCache(): void {
  cachedConfig = null;
}

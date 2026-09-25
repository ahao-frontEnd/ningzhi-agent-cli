import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ChatOpenAI } from "@langchain/openai";

const CONFIG_DIR = path.join(os.homedir(), ".ningzhi");
const CONFIG_PATH = path.join(CONFIG_DIR, "ningzhi.json");

interface NingzhiConfig {
  model: {
    model: string;
    apiKey: string;
    baseURL: string;
  };
}

function loadConfig(): NingzhiConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `找不到配置文件 ${CONFIG_PATH}\n\n请创建该文件并配置 model 信息，例如：\n{\n  "model": {\n    "model": "kimi-k2.6",\n    "apiKey": "your-api-key",\n    "baseURL": "https://api.moonshot.cn/v1"\n  }\n}`,
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

  return config;
}

export const modelConfig = loadConfig();

// 只要能支持 openai 的接口格式，都可以用。
export function createModel(options?: { streaming?: boolean }): ChatOpenAI {
  return new ChatOpenAI({
    model: modelConfig.model.model,
    apiKey: modelConfig.model.apiKey,
    configuration: {
      baseURL: modelConfig.model.baseURL,
    },
    streaming: options?.streaming ?? true,
    // 透传给模型 API 的额外参数：关闭模型的深度思考（thinking）模式
    modelKwargs: {
      thinking: { type: "disabled" },
    },
  });
}

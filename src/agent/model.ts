import { ChatOpenAI } from "@langchain/openai";
import { getModelConfig } from "./config";

const modelConfig = getModelConfig();

// 只要能支持 openai 的接口格式，都可以用。
export function createModel(options?: { streaming?: boolean }): ChatOpenAI {
  return new ChatOpenAI({
    model: modelConfig.model,
    apiKey: modelConfig.apiKey,
    configuration: {
      baseURL: modelConfig.baseURL,
    },
    streaming: options?.streaming ?? true,
    // 透传给模型 API 的额外参数：关闭模型的深度思考（thinking）模式
    modelKwargs: {
      thinking: { type: "disabled" },
    },
  });
}

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

export async function checkModel(): Promise<boolean> {
  if (modelConfig.apiKey.length < 20) {
    try {
      const model = createModel({ streaming: false });
      await model.invoke([{ role: "user", content: "hi" }]);
    } catch {
      console.log(
        `\n⚠️ API Key 验证失败，请检查配置是否正确\n\n请参考 https://www.npmjs.com/package/ningzhi-agent-cli?activeTab=readme 修改配置\n`,
      );
      return false;
    }
  }
  return true;
}

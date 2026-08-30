import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "moonshot-v1-8k": 8192,
  "moonshot-v1-32k": 32768,
  "moonshot-v1-128k": 131072,
  "kimi-k2.6": 3000,
};

export function getModelContextLimit(): number {
  const modelName = process.env.MOONSHOT_MODEL_NAME || "";
  return MODEL_CONTEXT_LIMITS[modelName] || 128000;
}

/**
 * 格式化消息为压缩格式
 * @param messages 消息数组
 * @returns 压缩后的消息字符串
 */
function formatMessagesForCompression(messages: BaseMessage[]): string {
  return messages
    .map((msg) => {
      const role = msg.type;
      // 格式化消息内容为字符串
      let content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      // 如果是 AI 消息且有工具调用，添加工具调用信息
      if (role === "ai" && (msg as any).tool_calls?.length) {
        content += `\n[Tool Calls: ${JSON.stringify((msg as any).tool_calls)}]`;
      }
      // 格式化消息为压缩格式,  [消息角色]：消息内容
      return `[${role}] ${content}`;
    })
    .join("\n\n");
}

/**
 * 压缩消息为简洁的摘要
 * @param messages 消息数组
 * @param existingSummary 已存在的摘要
 * @returns 压缩后的摘要
 */
export async function compressMessages(
  messages: BaseMessage[],
  existingSummary: string | null,
): Promise<string> {
  // 如果消息数组为空，直接返回已存在的摘要
  if (messages.length === 0) {
    return existingSummary || "";
  }
  // 格式化消息为压缩格式
  const text = formatMessagesForCompression(messages);
  // 构建压缩提示
  const prompt = `请将以下对话内容压缩为一段简洁的摘要，保留关键信息、决策和结论：\n\n${text}`;
  // 调用大模型压缩摘要
  const model = new ChatOpenAI({
    model: process.env.MOONSHOT_MODEL_NAME,
    apiKey: process.env.MOONSHOT_API_KEY,
    configuration: {
      baseURL: "https://api.moonshot.cn/v1",
    },
    streaming: false,
    modelKwargs: {
      thinking: { type: "disabled" },
    },
  });
  // 处理大模型响应
  // 如果响应内容是字符串，直接返回；如果是对象，转换为字符串
  const response = await model.invoke([new HumanMessage(prompt)]);
  const newSummary =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
  // 如果已存在摘要，添加到新摘要中
  if (existingSummary) {
    return `${existingSummary}\n\n[后续对话摘要]\n${newSummary}`;
  }
  // 如果已不存在摘要，直接返回新摘要
  return newSummary;
}

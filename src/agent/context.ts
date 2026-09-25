import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { createModel, modelConfig } from "./model";

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Moonshot / Kimi
  "moonshot-v1-8k": 8192,
  "moonshot-v1-32k": 32768,
  "moonshot-v1-128k": 131072,
  "kimi-k2.6": 256000,

  // DeepSeek
  "deepseek-chat": 1048576,
  "deepseek-reasoner": 1048576,
  "deepseek-v3": 65536,
  "deepseek-v3.1": 131072,
  "deepseek-v4": 1048576,
  "deepseek-r1": 65536,

  // MiniMax
  "minimax-text-01": 1048576,
  "minimax-m1": 1048576,
  "minimax-m3": 1048576,

  // GLM (智谱)
  "glm-4": 131072,
  "glm-4-plus": 131072,
  "glm-4-air": 131072,
  "glm-4-flash": 131072,
  "glm-4v": 131072,

  // Qwen (Alibaba)
  "qwen-max": 32768,
  "qwen-plus": 131072,
  "qwen-plus-2025-07-28": 1048576,
  "qwen-turbo": 1048576,
  "qwen-long": 10485760,

  // Xiaomi MiMo
  "mimo-7b": 32768,
  "mimo-v2.5": 1048576,
};

export function getModelContextLimit(): number {
  const modelName = modelConfig.model.model || "";
  return MODEL_CONTEXT_LIMITS[modelName.toLowerCase()] || 128000;
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
  const model = createModel({ streaming: false });
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

/**
 * 计算安全的压缩边界索引，确保保留区域内的 tool_calls 和 ToolMessage 配对完整。
 * 防止 破坏了消息列表的完整度（ ToolMessage 匹配不到 对应的 AIMessage ），导致报错。
 *
 * 策略：从 messages.length - minKeep 开始，如果边界切在了 ToolMessage 或其对应的
 * AIMessage 之后，就把边界往前移动，直到整个工具调用单元都被保留。
 */
export function findSafeCompressionIndex(
  messages: BaseMessage[],
  minKeep: number,
): number {
  // 初始化压缩边界索引为 messages.length - minKeep
  let index = Math.max(0, messages.length - minKeep);
  // 收集当前保留区域内所有 ToolMessage 的 tool_call_id
  const toolCallIdsInKeepRegion = new Set<string>();
  // 从保留区域开始，向后遍历，收集所有 ToolMessage 的 tool_call_id
  for (let i = index; i < messages.length; i++) {
    if (messages[i].type === "tool") {
      toolCallIdsInKeepRegion.add((messages[i] as ToolMessage).tool_call_id);
    }
  }
  // 往前移动 index，直到所有 toolCallIdsInKeepRegion 都能在保留区域内找到对应的 AIMessage
  while (index > 0) {
    // 获取前一条消息
    const prevMsg = messages[index - 1];
    // 【1】如果前一条是 ToolMessage，它也会被纳入保留区，所以加入待匹配集合
    if (prevMsg.type === "tool") {
      toolCallIdsInKeepRegion.add((prevMsg as ToolMessage).tool_call_id);
      index--;
      continue;
    }
    // 【2】如果前一条是 AIMessage 且有 tool_calls，检查它 是否匹配 保留区内的 ToolMessage
    if (AIMessage.isInstance(prevMsg) && prevMsg.tool_calls?.length) {
      const hasMatchingCall = prevMsg.tool_calls.some(
        (call) => call.id && toolCallIdsInKeepRegion.has(call.id),
      );
      // 如果前一条 AIMessage 匹配了保留区内的 ToolMessage，就保留它
      if (hasMatchingCall) {
        // 这个 AIMessage 必须保留，index 前移
        index--;
        // 这个 AIMessage 可能还有其他 tool_calls，它们对应的 ToolMessage 也必须在保留区
        for (const call of prevMsg.tool_calls) {
          if (call.id) toolCallIdsInKeepRegion.add(call.id);
        }
        continue;
      }
    }
    // 【3】如果前一条不是 ToolMessage，并且，前一条不是 AIMessage 或者其 tool_calls 为空/匹配不上，就直接跳出循环
    break;
  }

  // 返回最终的压缩边界索引 《===  压缩边界的 结束索引 前移  《===  向前嗅探匹配的 ToolMessage 和 AIMessage 配对完整
  return index;
}

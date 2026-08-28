import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { type UsageMetadata } from "@langchain/core/messages";
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import { DB_PATH } from "./db";
import { tools } from "./tools";
import { discoverSkills, getSkillsListText } from "./skills";

dotenv.config();

// ── Skills ────────────────────────────────────────────────
discoverSkills();
const skillsText = getSkillsListText();
const basePrompt = "You are a helpful assistant.";
const systemPrompt = skillsText
  ? `${basePrompt}\n\n## Available Skills\n\nYou have access to the following skills. When a user's request matches a skill's description, you MUST call the \`load_skill\` tool to load that skill's full instructions, then follow them.\n\n${skillsText}`
  : basePrompt;

// ── 模型 ──────────────────────────────────────────────────
const model = new ChatOpenAI({
  model: process.env.MOONSHOT_MODEL_NAME,
  apiKey: process.env.MOONSHOT_API_KEY,
  configuration: {
    baseURL: "https://api.moonshot.cn/v1",
  },
  streaming: true,
});

// ── 记忆 ──────────────────────────────────────────────────
// recursive 作用： 1. 目录已存在时静默跳过(最重要)不报错。   2. 支持多级路径自动补全父目录：
// fs.mkdirSync("a/b/c", { recursive: true }); // 一口气把 a、a/b、a/b/c 全建出来
fs.mkdirSync(".dbData", { recursive: true });
const checkpointer = SqliteSaver.fromConnString(DB_PATH);

// ── Agent 创建 ────────────────────────────────────────────
export const agent = createAgent({
  model,
  tools,
  systemPrompt,
  checkpointer,
});

/**
 * 以流式方式运行 agent，将 token 逐个回调给调用方
 * @param {string} userMessage - 当前用户输入（历史已由 checkpointer 自动续接）
 * @param {Function} onToken   - 每个 token 到来时的回调 (token: string) => void
 * @param {string} threadId    - 会话 ID，相同 ID 自动续上历史记录
 * @returns {Promise<{ response: string; usageMetadata?: UsageMetadata }>}  完整的 AI 回复文本及 token 使用信息
 */
export async function runAgentStream(
  userMessage: string,
  onToken: (token: string) => void,
  threadId: string = "default-session",
  signal?: AbortSignal,
): Promise<{ response: string; usageMetadata?: UsageMetadata }> {
  const config = { configurable: { thread_id: threadId } };

  const stream = await agent.stream(
    { messages: [{ role: "user", content: userMessage }] },
    {
      ...config,
      streamMode: "messages",
      signal,
    },
  );

  let fullResponse = "";
  let usageMetadata: UsageMetadata | undefined;

  for await (const chunk of stream as any) {
    if (signal?.aborted) {
      throw new Error("abort");
    }

    const message = chunk[0];
    const metadata = chunk[1];

    // streamMode: "messages" 下，工具调用等非模型节点产生的消息也会出现在流里，
    // 通过 metadata.langgraph_node 过滤，只保留模型节点（model_request）输出的 token
    if (metadata?.langgraph_node !== "model_request") continue;

    const msgUsage = (message as any).usage_metadata;
    if (msgUsage) {
      usageMetadata = msgUsage;
    }

    // AIMessageChunk 的 content 在 message.content 属性上，不在 kwargs.content
    const content: string =
      (message as any).content ?? (message as any).kwargs?.content ?? "";
    const toolCallChunks = (message as any).tool_call_chunks ?? [];

    // 跳过两类非用户可见的 chunk：空内容 chunk，以及模型发起工具调用的 chunk（工具调用指令不是回复文本）
    if (!content || toolCallChunks.length > 0) continue;

    onToken(content);
    fullResponse += content;
  }

  return { response: fullResponse, usageMetadata };
}

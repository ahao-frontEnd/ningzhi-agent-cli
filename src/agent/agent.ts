import { ChatOpenAI } from "@langchain/openai";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import {
  type UsageMetadata,
  type BaseMessage,
  SystemMessage,
  isAIMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  StateGraph,
  Annotation,
  START,
  END,
  CompiledStateGraph,
} from "@langchain/langgraph";
import { messagesStateReducer } from "@langchain/langgraph";
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import { DB_PATH } from "./db";
import { tools } from "./tools";
import { discoverSkills, getSkillsListText } from "./skills";
import { compressMessages } from "./context";

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

const modelWithTools = model.bindTools(tools);

// ── State Schema ──────────────────────────────────────────
const StateAnnotation = Annotation.Root({
  // 完整对话消息列表（含 HumanMessage / AIMessage / ToolMessage 等）
  messages: Annotation<BaseMessage[]>({
    // reducer：合并状态更新时使用 langgraph 内置的消息合并器（按 id 去重、追加新消息、支持删除/替换）
    reducer: messagesStateReducer,
    default: () => [],
  }),
  contextSummary: Annotation<string | null>({
    reducer: (_prev, next) => next, // 保持最新摘要
    default: () => null,
  }),
  compressionCount: Annotation<number>({
    reducer: (_prev, next) => next, // 保持最新压缩次数
    default: () => 0,
  }),
  lastCompressedIndex: Annotation<number>({
    reducer: (_prev, next) => next, // 保持最新压缩索引
    default: () => 0,
  }),
});

type AgentState = typeof StateAnnotation.State;

// ── Graph Nodes ───────────────────────────────────────────
async function modelRequest(state: AgentState, config: any) {
  let modelMessages = state.messages ?? [];
  // 如果有历史摘要，添加到模型输入中
  if (state.contextSummary && state.lastCompressedIndex > 0) {
    const summaryMsg = new SystemMessage(
      `历史对话摘要：\n\n${state.contextSummary}`,
    );
    // 从压缩索引开始添加新消息
    modelMessages = [
      summaryMsg,
      ...modelMessages.slice(state.lastCompressedIndex),
    ];
  }
  // 构建模型输入
  const messages = [new SystemMessage(systemPrompt), ...modelMessages];
  // 调用模型
  const response = await modelWithTools.invoke(messages, config);
  // 返回模型响应， response 是一个 AIMessage 对象
  return { messages: [response] };
}

function shouldContinue(state: AgentState) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (isAIMessage(lastMessage) && lastMessage.tool_calls?.length) {
    return "tools";
  }
  return END;
}

async function toolNode(state: AgentState, config: any) {
  const messages = state.messages;
  // 提取所有工具调用 ID
  const toolMessageIds = new Set(
    messages
      .filter((msg) => msg.getType() === "tool")
      .map((msg) => (msg as ToolMessage).tool_call_id),
  );
  // 找到最后一个 AI 消息
  let aiMessage: BaseMessage | undefined;
  // 从后往前遍历消息，找到第一个 AI 消息
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isAIMessage(messages[i])) {
      aiMessage = messages[i];
      break;
    }
  }
  // 如果没有 AI 消息，或者不是 AI 消息，抛出错误
  if (!aiMessage || !isAIMessage(aiMessage)) {
    throw new Error("ToolNode only accepts AIMessages as input.");
  }
  // 过滤出 未处理的工具调用
  const toolCalls =
    aiMessage.tool_calls?.filter(
      (call) => call.id == null || !toolMessageIds.has(call.id),
    ) ?? [];
  // 并行调用工具
  const outputs = await Promise.all(
    // 对每个工具调用，异步调用工具
    toolCalls.map(async (call) => {
      // 查找工具
      const tool = tools.find((t) => t.name === call.name);
      try {
        if (!tool) throw new Error(`Tool "${call.name}" not found.`);
        // 调用工具
        const output = await tool.invoke(
          { ...call, type: "tool_call" },
          config,
        );
        const content =
          typeof output === "string" ? output : JSON.stringify(output);
        // 返回工具调用消息
        return new ToolMessage({
          content,
          tool_call_id: call.id ?? "",
          name: call.name,
        });
      } catch (e: any) {
        return new ToolMessage({
          content: `Error: ${e.message}\n Please fix your mistakes.`,
          tool_call_id: call.id ?? "",
          name: call.name,
        });
      }
    }),
  );

  return { messages: outputs };
}

// ── 记忆 ──────────────────────────────────────────────────
// recursive 作用： 1. 目录已存在时静默跳过(最重要)不报错。   2. 支持多级路径自动补全父目录：
// fs.mkdirSync("a/b/c", { recursive: true }); // 一口气把 a、a/b、a/b/c 全建出来
fs.mkdirSync(".dbData", { recursive: true });
const checkpointer = SqliteSaver.fromConnString(DB_PATH);

// ── Agent 创建 ────────────────────────────────────────────
const workflow = new StateGraph(StateAnnotation)
  .addNode("model_request", modelRequest)
  .addNode("tools", toolNode)
  .addEdge(START, "model_request")
  .addConditionalEdges("model_request", shouldContinue, {
    tools: "tools",
    [END]: END,
  })
  .addEdge("tools", "model_request");

export const agent: CompiledStateGraph<any, any, any> = workflow.compile({
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
    { messages: [new HumanMessage(userMessage)] },
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

// 压缩上下文
export async function compressContext(
  threadId: string,
): Promise<{ didCompress: boolean; count: number }> {
  const config = { configurable: { thread_id: threadId } };
  const currentState = await agent.getState(config);
  const messages = currentState.values.messages || [];
  const existingSummary = currentState.values.contextSummary || null;
  const lastIndex = currentState.values.lastCompressedIndex || 0;
  const count = currentState.values.compressionCount || 0;

  const recentKeep = 6;
  // 如果当前消息数小于等于保留区域 + 最后压缩索引，直接返回
  if (messages.length <= recentKeep + lastIndex) {
    return { didCompress: false, count };
  }

  const toCompress = messages.slice(lastIndex, messages.length - recentKeep);
  const newSummary = await compressMessages(toCompress, existingSummary);

  await agent.updateState(config, {
    contextSummary: newSummary,
    lastCompressedIndex: messages.length - recentKeep,
    compressionCount: count + 1,
  });

  return { didCompress: true, count: count + 1 };
}

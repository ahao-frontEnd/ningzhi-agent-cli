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
  // 可选的"模型输入消息"通道：不为空时优先传给模型，便于上层按需裁剪上下文
  llmInputMessages: Annotation<BaseMessage[]>({
    // reducer：每次更新都以新传入的值覆盖旧值（把之前的旧状态置空数组，相当于 replace 语义）
    reducer: (_, update) => messagesStateReducer([], update),
    default: () => [],
  }),
});

type AgentState = typeof StateAnnotation.State;

function getModelInputState(state: AgentState) {
  const { messages, llmInputMessages, ...rest } = state;
  if (llmInputMessages != null && llmInputMessages.length > 0) {
    return { messages: llmInputMessages, ...rest };
  }
  return { messages, ...rest };
}

// ── Graph Nodes ───────────────────────────────────────────
async function modelRequest(state: AgentState, config: any) {
  const input = getModelInputState(state);
  const messages = [new SystemMessage(systemPrompt), ...(input.messages ?? [])];
  const response = await modelWithTools.invoke(messages, config);
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
  const toolMessageIds = new Set(
    messages
      .filter((msg) => msg.getType() === "tool")
      .map((msg) => (msg as ToolMessage).tool_call_id),
  );

  let aiMessage: BaseMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isAIMessage(messages[i])) {
      aiMessage = messages[i];
      break;
    }
  }

  if (!aiMessage || !isAIMessage(aiMessage)) {
    throw new Error("ToolNode only accepts AIMessages as input.");
  }

  const toolCalls =
    aiMessage.tool_calls?.filter(
      (call) => call.id == null || !toolMessageIds.has(call.id),
    ) ?? [];

  const outputs = await Promise.all(
    toolCalls.map(async (call) => {
      const tool = tools.find((t) => t.name === call.name);
      try {
        if (!tool) throw new Error(`Tool "${call.name}" not found.`);
        const output = await tool.invoke(
          { ...call, type: "tool_call" },
          config,
        );
        const content =
          typeof output === "string" ? output : JSON.stringify(output);
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

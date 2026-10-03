import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import {
  type UsageMetadata,
  type BaseMessage,
  SystemMessage,
  AIMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  StateGraph,
  Annotation,
  START,
  END,
  CompiledStateGraph,
  interrupt,
  Command,
} from "@langchain/langgraph";
import { messagesStateReducer } from "@langchain/langgraph";

import * as dotenv from "dotenv";
import * as fs from "node:fs";

import { DB_PATH } from "./db";
import { tools, maybePersistedOutput, initTools } from "./tools";

import { compressMessages, findSafeCompressionIndex } from "./context";
import { formatToolLog, formatTodoList } from "./colors";
import { processTodoCalls, formatTodoListForPrompt } from "./todo";
import { buildSystemPrompt } from "./prompt";

import { checkReadPermission } from "./permission/read";
import { checkWritePermission } from "./permission/write";
import { checkExecPermission } from "./permission/exec";
import { checkNetworkPermission } from "./permission/network";

import { runPreToolUseHooks, runPostToolUseHooks } from "./hooks";

dotenv.config();

import { createModel } from "./model";

// ── 模型 ──────────────────────────────────────────────────
const model = createModel({ streaming: true });

// ── State Schema ──────────────────────────────────────────
const StateAnnotation = Annotation.Root({
  // 完整对话消息列表（含 HumanMessage / AIMessage / ToolMessage 等）
  messages: Annotation<BaseMessage[]>({
    // reducer：合并状态更新时使用 langgraph 内置的消息合并器（按 id 去重、追加新消息、支持删除/替换）
    reducer: messagesStateReducer,
    default: () => [],
  }),
  contextSummary: Annotation<string | null>({
    reducer: (_prev: string | null, next: string | null) => next, // 保持最新摘要
    default: () => null,
  }),
  compressionCount: Annotation<number>({
    reducer: (_prev: number, next: number) => next, // 保持最新压缩次数
    default: () => 0,
  }),
  lastCompressedIndex: Annotation<number>({
    reducer: (_prev: number, next: number) => next, // 保持最新压缩索引
    default: () => 0,
  }),
  // SqliteSaver 会自动持久化该字段，不受 context compression 影响
  // 即便是压缩了，或者退出了再重新开始，都不影响
  todoList: Annotation<import("./todo.ts").TodoItem[] | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type AgentState = typeof StateAnnotation.State;

// ── Graph Nodes ───────────────────────────────────────────

function shouldContinue(state: AgentState) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (AIMessage.isInstance(lastMessage) && lastMessage.tool_calls?.length) {
    return "tools";
  }
  return END;
}

/**
 * 简化工具调用消息，只保留最近 3 个
 * @param messages - 原始消息数组
 * @returns 简化后的消息数组
 */
function simplifyToolMessages(messages: BaseMessage[]): BaseMessage[] {
  const toolIndices: number[] = [];
  // 找到所有工具调用消息的索引
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].type === "tool") {
      toolIndices.push(i);
    }
  }
  // 只保留最近 3 个工具调用消息
  const recentToolIndices = new Set(toolIndices.slice(-3));
  // 遍历所有消息，简化工具调用消息
  return messages.map((msg, i) => {
    if (msg.type !== "tool") return msg;
    if (recentToolIndices.has(i)) return msg;
    const toolMsg = msg as ToolMessage;
    if (toolMsg.name === "read_file") return msg;
    // 简化工具调用消息，只保留工具名
    return new ToolMessage({
      content: `[Previous: used ${toolMsg.name}]`,
      tool_call_id: toolMsg.tool_call_id,
      name: toolMsg.name,
    });
  });
}

// ── 记忆 ──────────────────────────────────────────────────
// recursive 作用： 1. 目录已存在时静默跳过(最重要)不报错。   2. 支持多级路径自动补全父目录：
// fs.mkdirSync("a/b/c", { recursive: true }); // 一口气把 a、a/b、a/b/c 全建出来
fs.mkdirSync(".dbData", { recursive: true });
const checkpointer = SqliteSaver.fromConnString(DB_PATH);

// ── Agent Graph 工厂 ──────────────────────────────────────
function createAgentGraph(toolList: typeof tools) {
  const modelWithTheseTools = model.bindTools(toolList);

  async function modelRequest(state: AgentState, config: any) {
    let modelMessages = state.messages ?? [];
    // 如果有历史摘要，添加到系统提示词
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
    // 简化工具调用消息，只保留工具名
    modelMessages = simplifyToolMessages(modelMessages);
    // 上下文压缩的最后一道防线
    // 只保留最近 500 条消息， 极端场景，一般达不到，是为了防止上下文爆炸，不过一般不加这个逻辑也可以正常工作
    modelMessages = modelMessages.slice(-500);
    // 构建模型输入，包含系统提示词和简化后的消息
    const messages: BaseMessage[] = [new SystemMessage(buildSystemPrompt())];
    // 如果有待办事项，添加到系统提示词
    if (state.todoList && state.todoList.length > 0) {
      messages.push(
        new SystemMessage(
          `当前任务进度：\n${formatTodoListForPrompt(state.todoList)}`,
        ),
      );
    }
    messages.push(...modelMessages);
    // 调用模型
    const response = await modelWithTheseTools.invoke(messages, config);
    // 返回模型响应， response 是一个 AIMessage 对象
    return { messages: [response] };
  }

  async function toolNode(state: AgentState, config: any) {
    const messages = state.messages;
    // 找到所有工具调用消息的 id
    const toolMessageIds = new Set(
      messages
        .filter((msg: BaseMessage) => msg.type === "tool")
        .map((msg: ToolMessage | any) => msg.tool_call_id),
    );
    // 找到最后一个 AI 消息
    let aiMessage: BaseMessage | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (AIMessage.isInstance(messages[i])) {
        aiMessage = messages[i];
        break;
      }
    }
    // 如果没有 AI 消息，或者不是 AI 消息，抛出错误
    if (!aiMessage || !AIMessage.isInstance(aiMessage)) {
      throw new Error("ToolNode only accepts AIMessages as input.");
    }
    // 过滤出 未处理的工具调用, 就是 id 为 null 或不在 toolMessageIds 中的
    // 如果 ai message 某个工具调用的 id 找不到对应的 ToolMessage，说明它还没被执行过，
    // 正常是走 !toolMessageIds.has(call.id) 这个逻辑
    const toolCalls =
      aiMessage.tool_calls?.filter(
        (call) => call.id == null || !toolMessageIds.has(call.id),
      ) ?? [];

    if (toolCalls.length === 0) {
      return { messages: [] };
    }
    // 过滤出允许执行的工具调用
    const allowCalls: typeof toolCalls = [];
    const blockMessages: ToolMessage[] = [];
    const confirmCalls: typeof toolCalls = [];
    // 遍历所有工具调用，根据权限等级判断是否允许执行
    for (const call of toolCalls) {
      const tool = toolList.find((t) => t.name === call.name);
      const level = tool?.permission_level;
      let decision:
        | { action: "allow" }
        | { action: "block"; reason: string }
        | { action: "confirm" };

      if (level === "read") {
        decision = checkReadPermission(call);
      } else if (level === "write") {
        decision = checkWritePermission(call);
      } else if (level === "exec") {
        decision = checkExecPermission(call);
      } else if (level === "network") {
        decision = checkNetworkPermission(call);
      } else if (level === "mcp") {
        decision = { action: "confirm" as const };
      } else {
        decision = { action: "allow" as const };
      }

      if (decision.action === "allow") {
        allowCalls.push(call);
      } else if (decision.action === "block") {
        blockMessages.push(
          new ToolMessage({
            content: decision.reason,
            tool_call_id: call.id ?? "",
            name: call.name,
          }),
        );
      } else {
        confirmCalls.push(call);
      }
    }

    // 执行允许执行的工具调用
    async function executeCalls(
      calls: typeof toolCalls,
    ): Promise<ToolMessage[]> {
      return Promise.all(
        calls.map(async (call) => {
          const tool = toolList.find((t) => t.name === call.name);
          console.log(formatToolLog(call.name, JSON.stringify(call.args)));
          try {
            const threadId = config?.configurable?.thread_id || "";

            // PreToolUse hook
            const preResult = await runPreToolUseHooks({
              toolName: call.name,
              toolArgs: call.args,
              toolCallId: call.id ?? "",
              threadId,
            });

            if (preResult.action === "block") {
              return new ToolMessage({
                content: preResult.reason,
                tool_call_id: call.id ?? "",
                name: call.name,
              });
            }

            if (!tool) throw new Error(`Tool "${call.name}" not found.`);
            const output = await tool.invoke(
              { ...call, type: "tool_call" },
              config,
            );
            let content =
              typeof output === "string" ? output : JSON.stringify(output);

            // PostToolUse hook
            const postResult = await runPostToolUseHooks({
              toolName: call.name,
              toolArgs: call.args,
              toolOutput: content,
              toolCallId: call.id ?? "",
              threadId,
            });

            if (postResult.action === "block") {
              content = postResult.reason;
            } else if (postResult.action === "inject") {
              content = `[Hook injection]\n${postResult.message}\n\n${content}`;
            }

            if (preResult.action === "inject") {
              content = `[Hook injection]\n${preResult.message}\n\n${content}`;
            }

            const finalContent = await maybePersistedOutput(
              content,
              call.id ?? "",
            );
            return new ToolMessage({
              content: finalContent,
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
    }

    // 分离 todo 工具调用
    const regularAllowCalls: typeof allowCalls = [];
    const todoAllowCalls: typeof allowCalls = [];
    for (const call of allowCalls) {
      if (
        call.name === "create_todo_list" ||
        call.name === "update_todo_status"
      ) {
        todoAllowCalls.push(call);
      } else {
        regularAllowCalls.push(call);
      }
    }
    // 执行普通工具调用
    const regularOutputs = await executeCalls(regularAllowCalls);
    // 就是通过 LLM todoAllowCalls 的相关参数，更新状态图的 todoList  ===》 代替 tool.invoke 的执行
    const todoResult = processTodoCalls(todoAllowCalls, state.todoList);
    if (todoResult.todoList && todoResult.todoList.length > 0) {
      console.log(formatTodoList(todoResult.todoList)); // 打印最新的待办事项列表
    }
    // 合并普通工具调用和 todo 工具调用结果
    const allowOutputs = [...regularOutputs, ...todoResult.messages];

    if (confirmCalls.length === 0) {
      return {
        messages: [...allowOutputs, ...blockMessages],
        todoList: todoResult.todoList,
      };
    }
    const result = interrupt({ toolCalls: confirmCalls });

    if (result !== "approved") {
      const deniedMessages = confirmCalls.map(
        (call) =>
          new ToolMessage({
            content: "Tool execution was denied by the user.",
            tool_call_id: call.id ?? "",
            name: call.name,
          }),
      );
      return {
        messages: [...allowOutputs, ...blockMessages, ...deniedMessages],
        todoList: todoResult.todoList,
      };
    }

    const confirmOutputs = await executeCalls(confirmCalls);
    return {
      messages: [...allowOutputs, ...blockMessages, ...confirmOutputs],
      todoList: todoResult.todoList,
    };
  }

  // 定义工作流
  const workflow = new StateGraph(StateAnnotation)
    .addNode("model_request", modelRequest)
    .addNode("tools", toolNode)
    .addEdge(START, "model_request")
    .addConditionalEdges("model_request", shouldContinue, {
      tools: "tools",
      [END]: END,
    })
    .addEdge("tools", "model_request");

  // 编译工作流
  return workflow.compile({
    checkpointer,
  });
}

// ── Agent 创建 ────────────────────────────────────────────
let agent: CompiledStateGraph<any, any, any> | null = null;
let subAgent: CompiledStateGraph<any, any, any> | null = null;

export async function initAgent(): Promise<void> {
  await initTools();
  agent = createAgentGraph(tools);
  subAgent = createAgentGraph(tools.filter((t) => t.name !== "agent_tool"));
}

function getAgent(): CompiledStateGraph<any, any, any> {
  if (!agent) throw new Error("Agent not initialized. Call initAgent() first.");
  return agent;
}

function getSubAgent(): CompiledStateGraph<any, any, any> {
  if (!subAgent)
    throw new Error("Agent not initialized. Call initAgent() first.");
  return subAgent;
}

// ── 核心运行逻辑 ──────────────────────────────────────────
async function _runAgent(
  compiledAgent: CompiledStateGraph<any, any, any>,
  userMessage: string,
  onToken: (token: string) => void,
  onToolConfirmation: (toolCalls: any[]) => Promise<boolean>,
  threadId: string,
  signal?: AbortSignal,
): Promise<{ response: string; usageMetadata?: UsageMetadata }> {
  const config = { configurable: { thread_id: threadId } };

  let fullResponse = "";
  let usageMetadata: UsageMetadata | undefined;
  let input: any = { messages: [new HumanMessage(userMessage)] };

  while (true) {
    const stream = await compiledAgent.stream(input, {
      ...config,
      streamMode: "messages",
      signal,
    });
    // for await...of 遍历的是 异步可迭代对象（AsyncIterable）
    // 每次 next() 返回的是 Promise，需要 await 才能拿到下一项。 LangGraph 的 agent.stream(...) 返回一个 AsyncGenerator。它的特点是：
    // 不是一次性把结果给你，而是 LLM 每生成一个 token（或一小批 token），就 yield 一次。 必须等网络/模型把这块数据推送过来才能继续，这正是 await 存在的意义。
    for await (const chunk of stream as any) {
      if (signal?.aborted) {
        throw new Error("abort");
      }
      const message = chunk[0];
      const metadata = chunk[1];
      // streamMode: "messages" 下，工具调用等非模型节点产生的消息也会出现在流里，
      // 通过 metadata.langgraph_node 过滤，只保留模型节点（model_request）输出的 token
      if (metadata?.langgraph_node !== "model_request") continue;
      // 从 message 中提取 token 使用信息
      const msgUsage = (message as any).usage_metadata;
      if (msgUsage) {
        usageMetadata = msgUsage;
      }
      // AIMessageChunk 的 content 在 message.content 属性上，不在 kwargs.content
      const content: string =
        (message as any).content ?? (message as any).kwargs?.content ?? "";
      const toolCallChunks = (message as any).tool_call_chunks ?? [];
      // 过滤掉工具调用消息，只保留模型节点（model_request）输出的 token
      if (!content || toolCallChunks.length > 0) continue;
      // 回调 token 给调用方
      onToken(content);
      fullResponse += content;
    }

    // 流消费完后，取出当前会话状态，检查是否卡在 interrupt 上
    // （toolNode 里的 interrupt({ toolCalls }) 会让图执行暂停，等待外部 resume）
    const state = await compiledAgent.getState(config);
    // 找到处于中断状态的任务（其 interrupts 数组非空）
    const interruptedTask = state.tasks?.find(
      (t: any) => t.interrupts?.length > 0,
    );
    // 没有中断任务，说明本轮已正常走到 END，退出 while 循环
    if (!interruptedTask) break;

    // =====》 有需要用户确认的工具调用，就会有中断任务  《===== 工具节点中断，来到 model_request 节点
    // 把待确认的工具调用清单回调给调用方，由用户决定是否执行
    const confirmed = await onToolConfirmation(
      interruptedTask.interrupts[0].value.toolCalls,
    );
    // 用 Command({ resume }) 把用户的决定送回给正在等待的 interrupt()   =====》  发送给 toolNode
    // 从 toolNode 里 interrupt() 调用的那一行继续往下执行
    // 对应 toolNode 中 `const result = interrupt({ toolCalls })` 的返回值
    input = new Command({ resume: confirmed ? "approved" : "denied" });
  }

  // 返回完整回复及 token 使用信息
  return { response: fullResponse, usageMetadata };
}

/**
 * 以流式方式运行 agent，将 token 逐个回调给调用方
 * @param {string} userMessage - 当前用户输入（历史已由 checkpointer 自动续接）
 * @param {Function} onToken   - 每个 token 到来时的回调 (token: string) => void
 * @param {Function} onToolConfirmation - tool 调用前的确认回调，返回 true 则执行，false 则拒绝
 * @param {string} threadId    - 会话 ID，相同 ID 自动续上历史记录
 * @returns {Promise<{ response: string; usageMetadata?: UsageMetadata }>}  完整的 AI 回复文本及 token 使用信息
 */
export async function runAgentStream(
  userMessage: string,
  onToken: (token: string) => void,
  onToolConfirmation: (toolCalls: any[]) => Promise<boolean>,
  threadId: string = "default-session",
  signal?: AbortSignal,
): Promise<{ response: string; usageMetadata?: UsageMetadata }> {
  return _runAgent(
    getAgent(),
    userMessage,
    onToken,
    onToolConfirmation,
    threadId,
    signal,
  );
}

/**
 * 启动一个 subagent 执行独立任务，完成后返回结果
 * @param {string} prompt - 给 subagent 的任务提示
 * @returns {Promise<string>} subagent 的最终回复
 */
export async function runSubAgent(prompt: string): Promise<string> {
  const threadId = `subagent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const result = await _runAgent(
    getSubAgent(),
    prompt.trim(),
    () => {}, // 不需要流式输出
    async () => true, // subagent 自动确认 tools
    threadId,
    undefined, // 主 agent 中断即可
  );
  return result.response;
}

// 压缩上下文
export async function compressContext(
  threadId: string,
): Promise<{ didCompress: boolean; count: number }> {
  const config = { configurable: { thread_id: threadId } };
  const currentState = await getAgent().getState(config);
  const messages = currentState.values.messages || [];
  const existingSummary = currentState.values.contextSummary || null;
  const lastIndex = currentState.values.lastCompressedIndex || 0;
  const count = currentState.values.compressionCount || 0;

  const recentKeep = 6;
  const safeIndex = findSafeCompressionIndex(messages, recentKeep);
  if (safeIndex <= lastIndex) {
    return { didCompress: false, count };
  }
  // 从 lastCompressedIndex 开始，压缩到 safeIndex
  // safeIndex 是最近保留的索引，压缩到 safeIndex 之前的消息
  const toCompress = messages.slice(lastIndex, safeIndex);
  const newSummary = await compressMessages(toCompress, existingSummary);

  await getAgent().updateState(config, {
    contextSummary: newSummary,
    lastCompressedIndex: safeIndex,
    compressionCount: count + 1,
  });

  return { didCompress: true, count: count + 1 };
}

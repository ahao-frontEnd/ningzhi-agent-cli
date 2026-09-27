import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

// 配置目录，hook 命令中的相对路径（如 ./hooks/xxx）相对于此目录解析
const CONFIG_DIR = path.join(os.homedir(), ".ningzhiAgentCli");
import {
  type HookConfig,
  type HooksConfig,
  getHooksConfig,
  clearConfigCache,
} from "../config";

const execAsync = promisify(exec);

export type { HookConfig, HooksConfig };

export type HookResult =
  | { action: "continue" }
  | { action: "block"; reason: string }
  | { action: "inject"; message: string };

export function loadHooksConfig(): HooksConfig {
  return getHooksConfig();
}

export function clearHooksCache(): void {
  clearConfigCache();
}

export function matchHooks(
  hooks: HookConfig[] | undefined,
  toolName: string,
): HookConfig[] {
  if (!hooks) return [];
  return hooks.filter((h) => h.matcher === "*" || toolName.includes(h.matcher));
}

export async function runHook(
  hook: HookConfig,
  env: Record<string, string>,
  timeout = 30000,
): Promise<HookResult> {
  const hookType = env.NINGZHI_HOOK_TYPE || "hook";
  console.log(`[Hook ${hookType}] ${hook.command}`);
  try {
    await execAsync(hook.command, {
      cwd: CONFIG_DIR,
      env: { ...process.env, ...env },
      timeout,
    });
    return { action: "continue" };
  } catch (error: any) {
    const code = error.code;
    const stderr = error.stderr || "";
    if (code === 1) {
      return { action: "block", reason: stderr }; // 工具不执行，stderr 作为错误返回   ===>   通用未知错误
    } else if (code === 2) {
      return { action: "inject", message: stderr }; // stderr 注入对话，工具仍执行  ===>  非法参数 / 命令语法错误
    }
    return {
      action: "block",
      reason: stderr || `Hook exited with code ${code}`,
    };
  }
}

export interface ToolHookContext {
  toolName: string;
  toolArgs: any;
  toolCallId: string;
  threadId: string;
}

export async function runPreToolUseHooks(
  context: ToolHookContext,
): Promise<HookResult> {
  const config = loadHooksConfig();
  const hooks = matchHooks(config.hooks.PreToolUse, context.toolName);

  const injectMessages: string[] = [];
  for (const hook of hooks) {
    const result = await runHook(hook, {
      NINGZHI_HOOK_TYPE: "PreToolUse",
      NINGZHI_TOOL_NAME: context.toolName,
      NINGZHI_TOOL_ARGS: JSON.stringify(context.toolArgs),
      NINGZHI_TOOL_CALL_ID: context.toolCallId,
      NINGZHI_THREAD_ID: context.threadId,
    });

    if (result.action === "block") {
      return result;
    }
    if (result.action === "inject") {
      injectMessages.push(result.message);
    }
  }

  if (injectMessages.length > 0) {
    return { action: "inject", message: injectMessages.join("\n") };
  }
  return { action: "continue" };
}

export interface PostToolHookContext extends ToolHookContext {
  toolOutput: string;
}

export async function runPostToolUseHooks(
  context: PostToolHookContext,
): Promise<HookResult> {
  const config = loadHooksConfig();
  const hooks = matchHooks(config.hooks.PostToolUse, context.toolName);

  const injectMessages: string[] = [];
  for (const hook of hooks) {
    const result = await runHook(hook, {
      NINGZHI_HOOK_TYPE: "PostToolUse",
      NINGZHI_TOOL_NAME: context.toolName,
      NINGZHI_TOOL_ARGS: JSON.stringify(context.toolArgs),
      NINGZHI_TOOL_OUTPUT: context.toolOutput,
      NINGZHI_TOOL_CALL_ID: context.toolCallId,
      NINGZHI_THREAD_ID: context.threadId,
    });

    if (result.action === "block") {
      return result;
    }
    if (result.action === "inject") {
      injectMessages.push(result.message);
    }
  }

  if (injectMessages.length > 0) {
    return { action: "inject", message: injectMessages.join("\n") };
  }
  return { action: "continue" };
}

export async function runSessionStartHooks(threadId: string): Promise<void> {
  const config = loadHooksConfig();
  const hooks = config.hooks.SessionStart || [];

  for (const hook of hooks) {
    const result = await runHook(hook, {
      NINGZHI_HOOK_TYPE: "SessionStart",
      NINGZHI_THREAD_ID: threadId,
    });

    if (result.action === "block") {
      console.error(`[SessionStart hook blocked] ${result.reason}`);
    } else if (result.action === "inject") {
      console.log(result.message);
    }
  }
}

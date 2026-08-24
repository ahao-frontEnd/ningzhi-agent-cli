import type { ChalkInstance } from "chalk";

// chalk 实例，懒加载，未初始化时为 null
let _chalk: ChalkInstance | null = null;

// 初始化颜色模块，必须在首次使用前调用一次
export async function initColors(): Promise<void> {
  const mod = await import("chalk");
  _chalk = mod.default as ChalkInstance;
}

// chalk 未就绪时返回的空实现：任意链式调用都返回原字符串，避免抛错
function createPlainFallback(): ChalkInstance {
  // get 拦截属性访问（如 .red、.bold），返回新的 fallback，使链式调用不会断
  // apply 拦截函数调用（如 chalk("text")），返回首个参数原样输出
  const handler: ProxyHandler<any> = {
    get: () => createPlainFallback(),
    apply: (_target, _thisArg, args) => args[0] ?? "",
  };
  // 目标函数本身也实现为「返回首个参数」，与 apply 行为保持一致
  const fn = (...args: any[]) => args[0] ?? "";
  // 用 Proxy 包裹函数，模拟 chalk 的链式 + 调用接口
  return new Proxy(fn, handler) as ChalkInstance;
}

// 获取 chalk 实例，未初始化则降级为空实现
function ck(): ChalkInstance {
  if (!_chalk) {
    return createPlainFallback();
  }
  return _chalk;
}

// 统一的颜色输出工具集合
export const color = {
  banner: (text: string) => ck().cyanBright.bold(text),
  userPrefix: () => ck().greenBright.bold("You: "),
  aiPrefix: () => ck().cyanBright.bold("AI: "),
  goodbye: (text: string) => ck().yellowBright(text),
  cancelled: (text: string) => ck().yellowBright.bold(text),
  error: (text: string) => ck().redBright.bold(text),

  // 工具调用日志相关样式
  toolTag: () => ck().magentaBright("[Tool]"), // magentaBright 粉色高亮
  toolName: (name: string) => ck().yellowBright(name), // yellowBright 黄色高亮
  toolAction: () => ck().gray("called:"), // gray 灰色
  toolArg: (arg: string) => ck().cyan(arg), // cyan 青色
};

// 格式化工具调用日志：形如 [Tool] toolName called: detail
export function formatToolLog(name: string, detail?: string): string {
  const parts = [color.toolTag(), color.toolName(name), color.toolAction()];
  if (detail) {
    parts.push(color.toolArg(detail));
  }
  return "\n" + parts.join(" ");
}

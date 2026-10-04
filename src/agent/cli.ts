/// <reference path="../streammark.d.ts" />
import * as readline from "readline"; // readline 用于处理命令行输入输出，提供交互式界面
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runAgentStream, compressContext } from "./agent";
import { getModelContextLimit } from "./context";
import { color, formatToolLog } from "./colors";
import { runSessionStartHooks } from "./hooks";

import { threadId, commands } from "./commands";

const pkg = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8"),
);

// 全局复用的 readline 接口。反复 createInterface/close 会导致 process.stdin
// 在 flowing/paused 状态间反复切换，在 Windows 控制台下容易出现“提示符显示了
// 但打字没反应、要多按一两次回车”的问题。复用单一接口可避免状态抖动。
export const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 让 process.stdin 开始发出 "keypress" 事件（默认不发）
// 这样才能在 AI 请求过程中 实时捕获 ESC 键而不必等待用户按回车
// 只初始化一次：让 process.stdin 发出 keypress 事件，供 ESC 取消功能使用。
// emitKeypressEvents 本身是幂等的，但放在模块加载阶段更清晰。
readline.emitKeypressEvents(process.stdin);

// 打印启动 Banner：ASCII 艺术标题 + 信息盒 + 使用说明
async function printBanner(): Promise<void> {
  // 动态导入 figlet（ASCII 字体）和 boxen（边框盒子），避免首屏加载开销
  const figlet = (await import("figlet")).default; // figlet 用于生成 ASCII 字体
  const { default: boxen } = await import("boxen"); // boxen 用于创建带边框的文本框
  // 用 Slant 字体渲染包名，并以 banner 色输出
  console.log(color.banner(figlet.textSync(pkg.name, { font: "Slant" })));
  // 信息盒内容：每行「字段名: 值」，字段名用灰色弱化
  const info = [
    `${color.gray("Description")}: ${pkg.description}`,
    `${color.gray("Version")}:     ${pkg.version}`,
    `${color.gray("Author")}:      ${pkg.author}`,
    `${color.gray("Docs")}:        ${pkg.docs}`,
  ].join("\n");
  // boxen 把 info 包成圆角边框盒子，padding=1 留内边距，灰色边框
  console.log(
    boxen(info, {
      padding: 1,
      borderStyle: "round",
      borderColor: "gray",
    }),
  );
  // 使用说明：按键与退出命令
  console.log("Usage:");
  console.log("  ESC       - Cancel AI request");
  console.log("  exit      - Exit the chat");
  for (const [name, cmd] of commands) {
    // padEnd 如果不足8个字符，用空格填充到8个字符
    console.log(`  /${name.padEnd(8)} - ${cmd.description}`);
  }
  console.log();
}

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    // 清空上一轮可能残留的输入行：AI 生成期间 stdin 处于流动模式，用户误按的
    // 键会被 readline 累积到行缓冲区。若不清空，下一轮 question 会立即返回
    // 残留内容，表现为"刚出提示符就自动提交了空内容/旧内容"。
    rl.write(null, { ctrl: true, name: "u" });
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function chat(userInput: string): Promise<void> {
  // 动态导入 streammark（ESM 模块），创建流式 Markdown 渲染器
  const { MarkdownStream } = await import("streammark");
  const mdStream = new MarkdownStream({ theme: "dark" });

  process.stdout.write("\n" + color.aiPrefix());

  const controller = new AbortController();

  // 监听 ESC 键，中断 AI 请求
  const escListener = (_str: string, key: { name?: string }) => {
    if (key.name === "escape" || key.name === "esc") {
      process.stdout.write("\n\n" + color.cancelled("[Cancelled]") + "\n");
      controller.abort();
    }
  };
  // 监听 process.stdin 的 "keypress" 事件，捕获 ESC 键
  process.stdin.on("keypress", escListener);
  // rl.question 结束时会内部调用 rl.pause() 暂停 stdin，导致 AI 生成期间
  // keypress 事件无法触发、ESC 取消失效。这里主动恢复 stdin 流动。
  process.stdin.resume();

  let usageMetadata;

  try {
    const result = await runAgentStream(
      userInput,
      (token: string) => {
        // process.stdout.write(token);
        // 将 token 推给 streammark 渲染器，由它负责流式 Markdown 渲染
        mdStream.write(token);
      },
      async (toolCalls) => {
        for (const call of toolCalls) {
          console.log(formatToolLog(call.name, JSON.stringify(call.args)));
        }
        const answer = await new Promise<string>((resolve) => {
          rl.question("确认执行以上工具? (y/n): ", resolve);
        });
        return (
          answer.trim().toLowerCase() === "y" ||
          answer.trim().toLowerCase() === "yes"
        );
      },
      threadId,
      controller.signal,
    );
    usageMetadata = result.usageMetadata;
  } catch (err) {
    // 用户按 ESC 取消时，可能是手动抛出的 "abort"，也可能是流底层抛出的
    // AbortError（message 含 "aborted"）。两种情况都静默处理，不显示错误。
    const msg = (err as Error).message ?? "";
    const isAbort =
      msg === "abort" ||
      (err as Error).name === "AbortError" ||
      /abort/i.test(msg);
    if (!isAbort) {
      throw err;
    }
  } finally {
    process.stdin.removeListener("keypress", escListener);
    // 结束 Markdown 流，刷新缓冲区中剩余的未完成内容
    mdStream.end();
  }

  // 在一轮对话 结束后打印 token 使用情况
  if (usageMetadata) {
    const limit = getModelContextLimit();
    const percentage = (usageMetadata.total_tokens / limit) * 100;
    const percentageStr = percentage.toFixed(1);
    const tokenText = `\nContext window token usage rate: ${usageMetadata.total_tokens.toLocaleString()} / ${limit.toLocaleString()} (${percentageStr}%)`;
    if (percentage >= 80) {
      process.stdout.write(
        "\n" +
          color.error(tokenText) +
          "\n" +
          color.error(
            "警告：Context window 接近大模型接口上限，即将压缩 Context，可能会丢失信息",
          ) +
          "\n" +
          color.error("建议输入 /new 命令开启新会话"),
      );
      try {
        const result = await compressContext(threadId);
        if (result.didCompress) {
          process.stdout.write(
            "\n" +
              color.error(
                `Context 已压缩（第 ${result.count} 次），已保留最近 6 条消息`,
              ) +
              "\n",
          );
          if (result.count >= 3) {
            process.stdout.write(
              color.error("强烈建议输入 /new 命令开启新会话，以避免信息丢失") +
                "\n",
            );
          }
        }
      } catch {
        // 压缩失败不影响主流程
      }
    } else {
      process.stdout.write("\n" + color.tokenInfo(tokenText));
    }
  }
  process.stdout.write("\n\n");
}

export async function interactiveChat(): Promise<void> {
  await printBanner();
  await runSessionStartHooks(threadId);

  while (true) {
    const userInput = await prompt(color.userPrefix());

    if (!userInput.trim()) continue;
    if (userInput.toLowerCase() === "exit") {
      console.log(color.goodbye("再见！"));
      rl.close();
      break;
    }
    // 以 "/" 开头的输入按内置命令处理（如 /skills），否则交给 AI
    if (userInput.startsWith("/")) {
      // 按空白（空格/Tab）拆分，如 "/new abc" -> ["/new", "abc"]
      const parts = userInput.trim().split(/\s+/);
      // 去掉首字符 "/" 得到命令名，例如："​/new" -> "new"
      const cmdName = parts[0].slice(1);
      // 其余部分作为命令参数传给处理器
      const args = parts.slice(1);
      const cmd = commands.get(cmdName);
      if (cmd) {
        await cmd.execute(args);
      } else {
        console.log(color.error(`Unknown command: ${cmdName}`));
      }
      continue; // 命令已处理完，回到循环等待下一次输入
    }

    try {
      await chat(userInput);
    } catch (err) {
      console.error(color.error(`请求出错: ${(err as Error).message}`));
    }
  }
}

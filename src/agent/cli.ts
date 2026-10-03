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

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

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
    const rl = createInterface(); // 创建 readline 接口，用于处理用户输入
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function chat(userInput: string): Promise<void> {
  const rl = createInterface();

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
      rl.close();
    }
  };
  // 让 process.stdin 开始发出 "keypress" 事件（默认不发）
  // 这样才能在 AI 请求过程中 实时捕获 ESC 键而不必等待用户按回车
  readline.emitKeypressEvents(process.stdin);
  // 监听 process.stdin 的 "keypress" 事件，捕获 ESC 键
  process.stdin.on("keypress", escListener);

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
    if ((err as Error).message !== "abort") {
      throw err;
    }
  } finally {
    process.stdin.removeListener("keypress", escListener);
    // 关闭接口，"交出对 stdin 的控制权"，移除 readline 挂在 stdin 上的内部监听
    rl.close();
    // 结束 Markdown 流，刷新缓冲区中剩余的未完成内容
    mdStream.end();
  }

  // 在一轮对话 结束后打印 token 使用情况
  if (usageMetadata) {
    const limit = getModelContextLimit();
    const percentage = (usageMetadata.total_tokens / limit) * 100;
    const percentageStr = percentage.toFixed(1);
    const tokenText = `\n\nContext window token usage rate: ${usageMetadata.total_tokens.toLocaleString()} / ${limit.toLocaleString()} (${percentageStr}%)`;
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
  // 在本轮对话的 readline 接口关闭后，把`process.stdin` 恢复回“流动模式”，
  // 确保下一轮`prompt()` 能正常读到用户输入
  // `rl.close()` 移除了所有消费者之后，stdin 可能退回暂停模式。
  // 如果不恢复，下一轮主循环里`prompt()` 新建的接口有可能出现“提示符显示了但打字没反应”的情况
  rl.resume();
}

export async function interactiveChat(): Promise<void> {
  await printBanner();
  await runSessionStartHooks(threadId);

  while (true) {
    const userInput = await prompt(color.userPrefix());

    if (!userInput.trim()) continue;
    if (userInput.toLowerCase() === "exit") {
      console.log(color.goodbye("再见！"));
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

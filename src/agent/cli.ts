#!/usr/bin/env node
import * as readline from "readline"; // readline 用于处理命令行输入输出，提供交互式界面
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runAgentStream, compressContext } from "./agent";
import { getModelContextLimit } from "./context";
import { initColors, color } from "./colors";
import { initDb } from "./db";

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
    const rl = createInterface();
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function chat(userInput: string): Promise<void> {
  const rl = createInterface();

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
  readline.emitKeypressEvents(process.stdin);
  process.stdin.on("keypress", escListener);

  let usageMetadata;

  try {
    const result = await runAgentStream(
      userInput,
      (token: string) => {
        process.stdout.write(token);
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
    rl.close();
  }

  // 在一轮对话 结束后打印 token 使用情况
  if (usageMetadata) {
    const limit = getModelContextLimit();
    const percentage = (usageMetadata.total_tokens / limit) * 100;
    const percentageStr = percentage.toFixed(1);
    const tokenText = `\n\nTokens: ${usageMetadata.total_tokens.toLocaleString()} / ${limit.toLocaleString()} (${percentageStr}%)`;
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
  rl.resume(); // 恢复 readline, 作用是等待用户输入下一个命令
}

async function interactiveChat(): Promise<void> {
  await printBanner();

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

async function main(): Promise<void> {
  await initColors();
  initDb();

  const program = new Command();
  program.name(pkg.name).description(pkg.description).version(pkg.version);

  // 如果带了命令参数，使用 commander 解析
  // 否则直接进入交互模式（pnpm dev 的情况）
  if (process.argv.length > 2) {
    program.parse();
  } else {
    await interactiveChat();
  }
}

main();

#!/usr/bin/env node
import * as readline from "readline";
import { createCommand } from "./command";
import { runAgentStream } from "./agent";
import { initColors, color } from "./colors";

const THREAD_ID = "user-session-1";

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
  // 读取 package.json 作为信息来源；require 相对路径基于编译后 dist 目录，故回退两层
  const pkg = require("../../package.json");
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
  console.log("  ESC  - Cancel AI request");
  console.log("  exit - Exit the chat\n");
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

  try {
    await runAgentStream(
      userInput,
      (token: string) => {
        process.stdout.write(token);
      },
      THREAD_ID,
      controller.signal,
    );
  } catch (err) {
    if ((err as Error).message !== "abort") {
      throw err;
    }
  } finally {
    process.stdin.removeListener("keypress", escListener);
    rl.close();
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

    try {
      await chat(userInput);
    } catch (err) {
      console.error(color.error(`请求出错: ${(err as Error).message}`));
    }
  }
}

async function main(): Promise<void> {
  await initColors();
  const program = createCommand();
  // 如果带了命令参数，使用 commander 解析
  // 否则直接进入交互模式（pnpm dev 的情况）
  if (process.argv.length > 2) {
    program.parse();
  } else {
    await interactiveChat();
  }
}

main();

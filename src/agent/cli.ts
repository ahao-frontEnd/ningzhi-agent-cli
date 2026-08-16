#!/usr/bin/env node
import * as readline from "readline";
import { createCommand } from "./command";
import { runAgentStream } from "./agent";

const THREAD_ID = "user-session-1";

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
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

  process.stdout.write("\nAI: ");

  const controller = new AbortController();

  // 监听 ESC 键，中断 AI 请求
  const escListener = (_str: string, key: { name?: string }) => {
    if (key.name === "escape" || key.name === "esc") {
      process.stdout.write("\n\n[Cancelled]\n");
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
  console.log('=== Agent 聊天控制台 (输入 "exit" 退出) ===\n');

  while (true) {
    const userInput = await prompt("You: ");

    if (!userInput.trim()) continue;
    if (userInput.toLowerCase() === "exit") {
      console.log("再见！");
      break;
    }

    try {
      await chat(userInput);
    } catch (err) {
      console.error("请求出错:", (err as Error).message);
    }
  }
}

async function main(): Promise<void> {
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

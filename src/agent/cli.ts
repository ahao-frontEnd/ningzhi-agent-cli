#!/usr/bin/env node

import * as readline from "readline";
import { createCommand } from "./command";
import { runAgentStream } from "./agent";

// 历史记录由 agent.js 的 checkpointer 自动持久化，这里只需固定 thread_id
const THREAD_ID = "user-session-1";

// 创建 readline 接口实例，用于从终端读取用户输入
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/* 
  rl.question(query, callback) 是 Node.js readline 模块里 Interface 的方法，用来向终端输出提示并等待用户输入。
    query：要显示的提示文本（string）。
    callback：用户输入完成（按回车）后调用的函数
*/
function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface(); // 每次调用都创建新的 readline 实例，避免与全局 rl 冲突
    rl.question(question, (answer) => {
      rl.close(); // 关闭 readline 实例，释放资源
      resolve(answer);
    });
  });
}

/* 
  readline.Interface 提供的控制输入流的方法；
  pause() 暂停对 stdin 的监听，
  resume() 恢复监听
*/
async function chat(userInput: string): Promise<void> {
  const rl = createInterface();
  rl.pause(); // 暂停 readline，避免用户输入被处理

  process.stdout.write("\nAI: ");

  await runAgentStream(
    userInput,
    (token: string) => {
      process.stdout.write(token);
    },
    THREAD_ID,
  );

  process.stdout.write("\n\n");
  rl.resume(); // 恢复 readline
  rl.close();
}

/* 
  主函数，负责启动聊天界面
 */
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

#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_PATH } from "./agent/config";

const pkg = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8"),
);

async function main(): Promise<void> {
  if (!existsSync(CONFIG_PATH)) {
    const { runInstall } = await import("./install");
    await runInstall();
    return;
  }

  const { initColors } = await import("./agent/colors");
  const { initDb } = await import("./agent/db");
  const { initAgent } = await import("./agent/agent");
  const { interactiveChat } = await import("./agent/cli");
  const { shutdownMcp } = await import("./agent/mcp");
  const { checkModel } = await import("./agent/model");

  await initColors();
  const valid = await checkModel();
  if (!valid) {
    return;
  }
  initDb();
  await initAgent();

  // SIGINT （Signal Interrupt，中断信号， 操作系统发给进程的一种"请你停下来"的信号）
  // 注册一次性的 SIGINT  信号处理（用户按 Ctrl+C 时触发）
  // 如果用户在退出流程进行中 再次 按 Ctrl+C，监听器已经被移除，不会重复执行`shutdownMcp()` ，避免重复关闭造成的错误
  // 先优雅关闭所有 MCP 子进程连接，再正常退出，避免残留子进程（避免子进程变成孤儿进程。）
  process.once("SIGINT", async () => {
    await shutdownMcp();
    process.exit(0);
  });

  const program = new Command();
  program.name(pkg.name).description(pkg.description).version(pkg.version);

  // 如果带了命令参数，使用 commander 解析, 否则直接进入交互模式（pnpm dev 的情况）
  if (process.argv.length > 2) {
    program.parse();
  } else {
    await interactiveChat();
  }

  // 确保在退出前关闭所有 MCP 子进程连接
  await shutdownMcp();
}

main();

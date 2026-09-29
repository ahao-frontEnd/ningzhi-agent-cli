import {
  loadHooksConfig,
  clearHooksCache,
  matchHooks,
  runHook,
  runPreToolUseHooks,
  runPostToolUseHooks,
  runSessionStartHooks,
  type HookConfig,
} from "./engine";

// 部分 mock fs 模块： 保留其余真实实现，仅把 readFileSync 替换成可断言的 mock
// 因为 loadHooksConfig() 内部通过 readFileSync 读取 hooks.json，
// 测试里要用 mockReturnValue 控制文件内容，而不是真的读磁盘
jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn(),
}));

import { readFileSync, mkdirSync } from "fs";
import os from "node:os";
import path from "node:path";

// runHook 内部用 child_process.exec 在 ~/.ningzhiAgentCli 目录下执行 hook 命令。
// CI 的干净环境（如 GitHub Actions 的 Linux runner）上该目录不存在，
// spawn 会因为 cwd 无效直接抛 ENOENT（连 shell 都不会启动），导致所有执行命令的用例失败。
// 本机开发时目录通常已存在，所以本地测试无法暴露这个问题。
const hooksCwd = path.join(os.homedir(), ".ningzhiAgentCli");
beforeAll(() => {
  mkdirSync(hooksCwd, { recursive: true });
});

describe("loadHooksConfig", () => {
  const mockedReadFileSync = readFileSync as jest.MockedFunction<
    typeof readFileSync
  >;

  beforeEach(() => {
    clearHooksCache();
    // 重置 mock 的调用记录与返回值，避免上个用例的 mockReturnValue 泄漏到下个用例
    mockedReadFileSync.mockClear();
  });

  it("loads and parses hooks.json", () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: "exec", command: "echo test" }],
        },
      }),
    );
    const config = loadHooksConfig();
    expect(config.hooks.PreToolUse).toHaveLength(1);
    expect(config.hooks.PreToolUse![0].matcher).toBe("exec");
  });

  it("returns empty config on error", () => {
    mockedReadFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    const config = loadHooksConfig();
    expect(config.hooks).toEqual({});
  });

  it("caches config", () => {
    mockedReadFileSync.mockReturnValue(JSON.stringify({ hooks: {} }));
    loadHooksConfig();
    loadHooksConfig();
    expect(mockedReadFileSync).toHaveBeenCalledTimes(1);
  });
});

describe("matchHooks", () => {
  const hooks: HookConfig[] = [
    { matcher: "exec", command: "cmd1" },
    { matcher: "file", command: "cmd2" },
    { matcher: "read", command: "cmd3" },
  ];

  it("matches by substring inclusion", () => {
    expect(matchHooks(hooks, "exec")).toHaveLength(1);
    expect(matchHooks(hooks, "read_file")).toHaveLength(2);
  });

  it("matches all tools with wildcard *", () => {
    const withWildcard: HookConfig[] = [
      ...hooks,
      { matcher: "*", command: "cmd4" },
    ];
    expect(matchHooks(withWildcard, "anything")).toHaveLength(1);
    expect(matchHooks(withWildcard, "exec")).toHaveLength(2);
  });

  it("returns empty array when no match", () => {
    expect(matchHooks(hooks, "web_search")).toHaveLength(0);
  });

  it("returns empty array when hooks is undefined", () => {
    expect(matchHooks(undefined, "exec")).toHaveLength(0);
  });
});

describe("runHook", () => {
  it("returns continue on exit 0", async () => {
    const result = await runHook({ matcher: "x", command: "exit 0" }, {});
    expect(result.action).toBe("continue");
  });

  it("returns block on exit 1 with stderr", async () => {
    const result = await runHook(
      {
        matcher: "x",
        command: "node -e \"console.error('blocked'); process.exitCode = 1\"",
      },
      {},
    );
    expect(result.action).toBe("block");
    expect((result as { reason: string }).reason).toBe("blocked\n");
  });

  it("returns inject on exit 2 with stderr", async () => {
    const result = await runHook(
      {
        matcher: "x",
        command: "node -e \"console.error('note'); process.exitCode = 2\"",
      },
      {},
    );
    expect(result.action).toBe("inject");
    expect((result as { message: string }).message).toBe("note\n");
  });

  it("returns block on unknown exit code", async () => {
    const result = await runHook({ matcher: "x", command: "exit 3" }, {});
    expect(result.action).toBe("block");
  });

  it("passes env variables", async () => {
    const result = await runHook(
      {
        matcher: "x",
        command:
          'node -e "console.error(process.env.TEST_VAR); process.exitCode = 1"',
      },
      { TEST_VAR: "hello" },
    );
    expect(result.action).toBe("block");
    expect((result as { reason: string }).reason).toBe("hello\n");
  });
});

describe("runPreToolUseHooks", () => {
  const mockedReadFileSync = readFileSync as jest.MockedFunction<
    typeof readFileSync
  >;

  beforeEach(() => {
    clearHooksCache();
    mockedReadFileSync.mockClear();
  });

  it("returns continue when no hooks match", async () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        hooks: { PreToolUse: [{ matcher: "exec", command: "exit 0" }] },
      }),
    );
    const result = await runPreToolUseHooks({
      toolName: "read_file",
      toolArgs: {},
      toolCallId: "1",
      threadId: "t1",
    });
    expect(result.action).toBe("continue");
  });

  it("blocks on matching hook exit 1", async () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "exec",
              command: "node -e \"console.error('no'); process.exitCode = 1\"",
            },
          ],
        },
      }),
    );
    const result = await runPreToolUseHooks({
      toolName: "exec",
      toolArgs: { command: "ls" },
      toolCallId: "1",
      threadId: "t1",
    });
    expect(result.action).toBe("block");
    expect((result as { reason: string }).reason).toBe("no\n");
  });

  it("injects on matching hook exit 2", async () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "exec",
              command:
                "node -e \"console.error('note'); process.exitCode = 2\"",
            },
          ],
        },
      }),
    );
    const result = await runPreToolUseHooks({
      toolName: "exec",
      toolArgs: {},
      toolCallId: "1",
      threadId: "t1",
    });
    expect(result.action).toBe("inject");
    expect((result as { message: string }).message).toBe("note\n");
  });

  it("aggregates multiple injects", async () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "exec",
              command:
                "node -e \"process.stderr.write('a'); process.exitCode = 2\"",
            },
            {
              matcher: "exec",
              command:
                "node -e \"process.stderr.write('b'); process.exitCode = 2\"",
            },
          ],
        },
      }),
    );
    const result = await runPreToolUseHooks({
      toolName: "exec",
      toolArgs: {},
      toolCallId: "1",
      threadId: "t1",
    });
    expect(result.action).toBe("inject");
    expect((result as { message: string }).message).toBe("a\nb");
  });

  it("stops at first block among multiple hooks", async () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "exec",
              command:
                "node -e \"console.error('first'); process.exitCode = 1\"",
            },
            {
              matcher: "exec",
              command:
                "node -e \"console.error('second'); process.exitCode = 2\"",
            },
          ],
        },
      }),
    );
    const result = await runPreToolUseHooks({
      toolName: "exec",
      toolArgs: {},
      toolCallId: "1",
      threadId: "t1",
    });
    expect(result.action).toBe("block");
    expect((result as { reason: string }).reason).toBe("first\n");
  });
});

describe("runPostToolUseHooks", () => {
  const mockedReadFileSync = readFileSync as jest.MockedFunction<
    typeof readFileSync
  >;

  beforeEach(() => {
    clearHooksCache();
    mockedReadFileSync.mockClear();
  });

  it("returns continue when no hooks match", async () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        hooks: { PostToolUse: [{ matcher: "exec", command: "exit 0" }] },
      }),
    );
    const result = await runPostToolUseHooks({
      toolName: "read_file",
      toolArgs: {},
      toolOutput: "content",
      toolCallId: "1",
      threadId: "t1",
    });
    expect(result.action).toBe("continue");
  });

  it("blocks on matching hook exit 1", async () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: "exec",
              command: "node -e \"console.error('bad'); process.exitCode = 1\"",
            },
          ],
        },
      }),
    );
    const result = await runPostToolUseHooks({
      toolName: "exec",
      toolArgs: {},
      toolOutput: "content",
      toolCallId: "1",
      threadId: "t1",
    });
    expect(result.action).toBe("block");
    expect((result as { reason: string }).reason).toBe("bad\n");
  });

  it("injects on matching hook exit 2", async () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: "exec",
              command:
                "node -e \"console.error('note'); process.exitCode = 2\"",
            },
          ],
        },
      }),
    );
    const result = await runPostToolUseHooks({
      toolName: "exec",
      toolArgs: {},
      toolOutput: "content",
      toolCallId: "1",
      threadId: "t1",
    });
    expect(result.action).toBe("inject");
    expect((result as { message: string }).message).toBe("note\n");
  });
});

describe("runSessionStartHooks", () => {
  // 把 readFileSync 断言为 Jest mock 类型，方便调用 mockReturnValue / 断言调用记录
  const mockedReadFileSync = readFileSync as jest.MockedFunction<
    typeof readFileSync
  >;
  // 劫持 console.log / console.error，避免 hook 内部输出污染测试控制台，
  // 同时用 spy 记录参数以便断言输出内容
  const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  const consoleErrorSpy = jest
    .spyOn(console, "error")
    .mockImplementation(() => {});

  // 每个用例前清空 hooks 缓存 + 重置所有 mock / spy 的调用记录，保证用例间隔离
  beforeEach(() => {
    clearHooksCache();
    mockedReadFileSync.mockClear();
    consoleSpy.mockClear();
    consoleErrorSpy.mockClear();
  });

  // 整个 describe 结束后恢复 console.log / console.error 的原始实现，
  // 避免影响后续测试文件
  afterAll(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("logs inject message on exit 2", async () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "",
              command:
                "node -e \"console.error('welcome'); process.exitCode = 2\"",
            },
          ],
        },
      }),
    );
    await runSessionStartHooks("t1");
    expect(consoleSpy).toHaveBeenCalledWith("welcome\n");
  });

  it("logs error on exit 1", async () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "",
              command:
                "node -e \"console.error('warn'); process.exitCode = 1\"",
            },
          ],
        },
      }),
    );
    await runSessionStartHooks("t1");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[SessionStart hook blocked] warn\n",
    );
  });
});

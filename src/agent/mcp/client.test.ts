import { loadMcpConfig, initializeMcpClients, callMcpTool } from "./client";

// Mock 掉 Node.js 内置 fs 模块，避免测试时读取真实的 mcp.json 文件
jest.mock("fs", () => ({
  readFileSync: jest.fn(), // 用 jest mock 函数替换真实的 readFileSync
}));

// 定义可在各测试用例中复用的 mock 函数，模拟 MCP SDK 的方法
const mockConnect = jest.fn(); // 模拟 Client.connect
const mockListTools = jest.fn(); // 模拟 Client.listTools
const mockCallTool = jest.fn(); // 模拟 Client.callTool
const mockClose = jest.fn(); // 模拟 StdioClientTransport.close

// Mock MCP SDK 的 Client 类，让它实例化后返回上述 mock 方法
jest.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    listTools: mockListTools,
    callTool: mockCallTool,
  })),
}));

// Mock MCP SDK 的 StdioClientTransport 类，避免真实启动子进程
jest.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: jest.fn().mockImplementation(() => ({
    close: mockClose,
  })),
}));

const { readFileSync } = require("fs");

describe("loadMcpConfig", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty object when file does not exist", () => {
    const err = new Error("ENOENT");
    (err as any).code = "ENOENT";
    readFileSync.mockImplementation(() => {
      throw err;
    });

    const config = loadMcpConfig();
    expect(config).toEqual({});
  });

  it("returns empty object and warns on parse error", () => {
    readFileSync.mockReturnValue("not-json");
    const consoleWarn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    const config = loadMcpConfig();
    expect(config).toEqual({});
    expect(consoleWarn).toHaveBeenCalled();

    consoleWarn.mockRestore();
  });

  it("returns empty object and warns when mcpServers is missing", () => {
    readFileSync.mockReturnValue(JSON.stringify({ otherField: true }));
    const consoleWarn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    const config = loadMcpConfig();
    expect(config).toEqual({});
    expect(consoleWarn).toHaveBeenCalled();

    consoleWarn.mockRestore();
  });

  it("parses valid mcp.json", () => {
    const data = {
      mcpServers: {
        playwright: { command: "npx", args: ["@playwright/mcp@latest"] },
      },
    };
    readFileSync.mockReturnValue(JSON.stringify(data));

    const config = loadMcpConfig();
    expect(config).toEqual({
      playwright: { command: "npx", args: ["@playwright/mcp@latest"] },
    });
  });
});

describe("initializeMcpClients", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty array when no config", () => {
    readFileSync.mockImplementation(() => {
      const err = new Error("ENOENT");
      (err as any).code = "ENOENT";
      throw err;
    });

    return expect(initializeMcpClients()).resolves.toEqual([]);
  });

  it("connects to a single server successfully", async () => {
    readFileSync.mockReturnValue(
      JSON.stringify({
        mcpServers: {
          test: { command: "node", args: ["server.js"] },
        },
      }),
    );

    mockConnect.mockResolvedValue(undefined);
    mockListTools.mockResolvedValue({
      tools: [{ name: "echo", description: "Echo", inputSchema: {} }],
    });

    const connections = await initializeMcpClients();
    expect(connections).toHaveLength(1);
    expect(connections[0].name).toBe("test");
    expect(connections[0].tools).toHaveLength(1);
    expect(connections[0].tools[0].name).toBe("echo");
  });

  it("skips failed servers and keeps successful ones", async () => {
    readFileSync.mockReturnValue(
      JSON.stringify({
        mcpServers: {
          good: { command: "node", args: ["good.js"] },
          bad: { command: "node", args: ["bad.js"] },
        },
      }),
    );

    mockConnect.mockImplementation(async () => {
      // first call succeeds, second fails
      if (mockConnect.mock.calls.length === 1) {
        return undefined;
      }
      throw new Error("Connection failed");
    });

    mockListTools.mockResolvedValue({
      tools: [{ name: "echo", description: "Echo", inputSchema: {} }],
    });

    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const connections = await initializeMcpClients();

    expect(connections).toHaveLength(1);
    expect(connections[0].name).toBe("good");
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});

describe("callMcpTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns concatenated text content", async () => {
    mockCallTool.mockResolvedValue({
      content: [
        { type: "text", text: "Hello" },
        { type: "text", text: "World" },
      ],
    });

    const result = await callMcpTool(
      { callTool: mockCallTool } as any,
      "echo",
      { msg: "hi" },
    );
    expect(result).toBe("Hello\nWorld");
  });

  it("throws when isError is true", async () => {
    mockCallTool.mockResolvedValue({
      content: [{ type: "text", text: "Something went wrong" }],
      isError: true,
    });

    await expect(
      callMcpTool({ callTool: mockCallTool } as any, "echo", {}),
    ).rejects.toThrow("Something went wrong");
  });

  it("falls back to JSON stringify for non-text content", async () => {
    mockCallTool.mockResolvedValue({
      content: [{ type: "image", data: "base64..." }],
    });

    const result = await callMcpTool(
      { callTool: mockCallTool } as any,
      "echo",
      {},
    );
    expect(result).toContain("image");
  });
});

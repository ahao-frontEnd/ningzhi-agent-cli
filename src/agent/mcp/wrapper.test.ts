import { wrapMcpTool } from "./wrapper";
import type { McpServerConnection } from "./client";

describe("wrapMcpTool", () => {
  const mockConnection = {
    name: "playwright",
    client: {} as any,
    transport: {} as any,
    tools: [],
  } as McpServerConnection;

  it("prefixes tool name with server name", () => {
    const wrapped = wrapMcpTool(mockConnection, {
      name: "navigate",
      description: "Navigate to a URL",
      inputSchema: {},
    });
    expect(wrapped.name).toBe("playwright_navigate");
  });

  it("prefixes description with server name", () => {
    const wrapped = wrapMcpTool(mockConnection, {
      name: "navigate",
      description: "Navigate to a URL",
      inputSchema: { type: "object", properties: { url: { type: "string" } } },
    });
    expect(wrapped.description).toContain("[MCP:playwright] Navigate to a URL");
  });

  it("uses fallback description when missing", () => {
    const wrapped = wrapMcpTool(mockConnection, {
      name: "click",
      inputSchema: {},
    });
    expect(wrapped.description).toContain("[MCP:playwright] No description");
  });

  it("passes MCP inputSchema as the tool schema", () => {
    const inputSchema = {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    };
    const wrapped = wrapMcpTool(mockConnection, {
      name: "navigate",
      description: "Navigate to a URL",
      inputSchema,
    });
    expect((wrapped as any).schema).toEqual(inputSchema);
  });

  it("sets permission_level to mcp", () => {
    const wrapped = wrapMcpTool(mockConnection, {
      name: "navigate",
      description: "Navigate to a URL",
      inputSchema: {},
    });
    expect((wrapped as any).permission_level).toBe("mcp");
  });
});

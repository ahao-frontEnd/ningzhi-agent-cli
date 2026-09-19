import { webFetchTool } from "./web_fetch_tool";

describe("webFetchTool", () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns page content on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "<html><body>Hello World</body></html>",
    });

    const result = await webFetchTool({ url: "https://example.com" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NingzhiBot/1.0)" },
      }),
    );
    expect(result).toBe("<html><body>Hello World</body></html>");
  });

  it("returns error when HTTP status is not ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "not found",
    });

    const result = await webFetchTool({ url: "https://example.com/missing" });

    expect(result).toBe("Error: HTTP 404 Not Found");
  });

  it("returns error when fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("network failure"));

    const result = await webFetchTool({ url: "https://example.com" });

    expect(result).toBe("Error: network failure");
  });

  it("returns error for empty url", async () => {
    const result = await webFetchTool({ url: "" });

    expect(result).toBe("Error: url is empty.");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns error for whitespace-only url", async () => {
    const result = await webFetchTool({ url: "   " });

    expect(result).toBe("Error: url is empty.");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("truncates content when it exceeds max length", async () => {
    const longContent = "a".repeat(10000);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => longContent,
    });

    const result = await webFetchTool({ url: "https://example.com/long" });

    expect(result.startsWith("a".repeat(8000))).toBe(true);
    expect(result).toContain("[Content truncated due to length]");
    expect(result.length).toBeLessThanOrEqual(
      8000 + "\n\n[Content truncated due to length]".length,
    );
  });

  it("passes through url with whitespace trimmed", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "content",
    });

    await webFetchTool({ url: "  https://example.com  " });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NingzhiBot/1.0)" },
      }),
    );
  });
});

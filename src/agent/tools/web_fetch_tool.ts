const MAX_LENGTH = 8000;

export async function webFetchTool({ url }: { url: string }): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) {
    return "Error: url is empty.";
  }

  try {
    const response = await fetch(trimmed, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NingzhiBot/1.0)", // 模拟浏览器请求
      },
    });

    if (!response.ok) {
      return `Error: HTTP ${response.status} ${response.statusText}`;
    }

    const text = await response.text();
    if (text.length > MAX_LENGTH) {
      return (
        text.slice(0, MAX_LENGTH) + "\n\n[Content truncated due to length]"
      );
    }
    return text;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

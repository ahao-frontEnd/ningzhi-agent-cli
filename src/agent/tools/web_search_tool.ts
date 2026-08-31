import { TavilySearch } from "@langchain/tavily";

export async function webSearchTool({
  query,
}: {
  query: string;
}): Promise<string> {
  const tavilySearch = new TavilySearch({
    maxResults: 2,
    topic: "general",
    tavilyApiKey: process.env.TAVILY_API_KEY,
  });

  try {
    const result = await tavilySearch.invoke({ query });

    if ("error" in result && result.error) {
      return `Error: ${result.error}`;
    }

    const lines: string[] = [];
    lines.push(`Query: ${result.query}`);

    if (result.answer) {
      lines.push(`Answer: ${result.answer}`);
    }

    lines.push("");
    lines.push("Results:");

    for (let i = 0; i < result.results.length; i++) {
      const r = result.results[i];
      lines.push(`${i + 1}. ${r.title} (${r.url})`);
      lines.push(`   ${r.content}`);
    }

    return lines.join("\n");
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

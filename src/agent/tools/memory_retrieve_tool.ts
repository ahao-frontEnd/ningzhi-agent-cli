import { searchMemories } from "../db";

export async function memoryRetrieveTool(
  {
    query,
    limit,
  }: {
    query: string[];
    limit?: number;
  },
  config?: any,
): Promise<string> {
  const trimmedQueries = query
    ?.map((q) => q.trim())
    .filter((q) => q.length > 0);

  if (!trimmedQueries || trimmedQueries.length === 0) {
    return "Error: query is required.";
  }

  const limitValue = limit ?? 10;
  if (limitValue < 1 || limitValue > 50) {
    return "Error: limit must be between 1 and 50.";
  }

  try {
    const results = searchMemories(trimmedQueries, limitValue);
    if (results.length === 0) {
      return "No relevant memories found.";
    }
    return JSON.stringify(results);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

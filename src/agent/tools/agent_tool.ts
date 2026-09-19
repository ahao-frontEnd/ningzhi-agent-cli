export async function agentTool({
  prompt,
}: {
  prompt: string;
}): Promise<string> {
  if (!prompt || !prompt.trim()) {
    return "Error: prompt is empty.";
  }
  // 动态 import 避免循环依赖：agent.ts -> tools.ts -> agent_tool.ts -> agent.ts
  const { runSubAgent } = await import("../agent");
  return runSubAgent(prompt.trim());
}

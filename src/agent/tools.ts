import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { readFileTool as readFileToolImpl } from "./tools/read_file_tool";
import { writeFileTool as writeFileToolImpl } from "./tools/write_file_tool";
import { execTool as execToolImpl } from "./tools/exec_tool";
import { runJsTool as runJsToolImpl } from "./tools/run_js_tool";
import { webSearchTool as webSearchToolImpl } from "./tools/web_search_tool";
import { webFetchTool as webFetchToolImpl } from "./tools/web_fetch_tool";
import { loadSkillTool as loadSkillToolImpl } from "./tools/load_skill_tool";
import { runPyTool as runPyToolImpl } from "./tools/run_py_tool";
import { memoryCreateTool as memoryCreateToolImpl } from "./tools/memory_create_tool";
import { memoryRetrieveTool as memoryRetrieveToolImpl } from "./tools/memory_retrieve_tool";
import { memoryDeleteTool as memoryDeleteToolImpl } from "./tools/memory_delete_tool";

// 读取文件工具
const readFileTool: DynamicStructuredTool = tool(readFileToolImpl, {
  name: "read_file",
  description: "Read the contents of a file in the current directory.",
  schema: z.object({
    filepath: z.string().describe("The relative path of the file to read."),
  }),
});

// 写入文件工具
const writeFileTool: DynamicStructuredTool = tool(writeFileToolImpl, {
  name: "write_file",
  description:
    "Create or overwrite a file in the current directory. Will create parent directories if needed.",
  schema: z.object({
    filepath: z.string().describe("The relative path of the file to write."),
    content: z.string().describe("The content to write to the file."),
  }),
});

// 执行命令工具
const execTool: DynamicStructuredTool = tool(execToolImpl, {
  name: "exec",
  description:
    "Execute a safe shell command in the current directory. Dangerous commands (rm, rmdir, etc.), absolute paths, and parent directory references are blocked.",
  schema: z.object({
    command: z.string().describe("The shell command to execute."),
  }),
});

// 执行JavaScript代码工具
const runJsTool: DynamicStructuredTool = tool(runJsToolImpl, {
  name: "run_js",
  description:
    "Execute JavaScript code using Node.js in the current directory. Returns stdout/stderr or error messages.",
  schema: z.object({
    code: z.string().describe("The JavaScript code to execute."),
  }),
});

// 执行Python代码工具
const runPyTool: DynamicStructuredTool = tool(runPyToolImpl, {
  name: "run_py",
  description:
    "Execute Python code using Python3 in the current directory. Returns stdout/stderr or error messages.",
  schema: z.object({
    code: z.string().describe("The Python code to execute."),
  }),
});

// 网络搜索工具
const webSearchTool: DynamicStructuredTool = tool(webSearchToolImpl, {
  name: "web_search",
  description:
    "Search the web using Tavily. Useful for finding current information, news, and facts.",
  schema: z.object({
    query: z.string().describe("The search query."),
  }),
});

// 网络获取工具
const webFetchTool: DynamicStructuredTool = tool(webFetchToolImpl, {
  name: "web_fetch",
  description:
    "Fetch the content of a web page by URL. Returns the raw HTML/text content. Useful when you need to read a specific page.",
  schema: z.object({
    url: z.string().describe("The full URL of the web page to fetch."),
  }),
});

// 加载技能工具
const loadSkillTool: DynamicStructuredTool = tool(loadSkillToolImpl, {
  name: "load_skill",
  description:
    "Load the full content of a skill by its name. Call this when you need to use a specific skill to handle the user request. You can only load one skill at a time.",
  schema: z.object({
    name: z.string().describe("The name of the skill to load."),
  }),
});

// 创建记忆工具
const memoryCreateTool: DynamicStructuredTool = tool(memoryCreateToolImpl, {
  name: "memory_create",
  description:
    "Save a piece of memory to the database. Use this when the user shares something worth remembering, such as a personal fact, event, preference, or skill.",
  schema: z.object({
    type: z
      .enum(["fact", "event", "preference", "skill"])
      .describe("The type of memory to save."),
    content: z
      .string()
      .describe("The natural language description of the memory."),
    keywords: z
      .array(z.string())
      .optional()
      .describe("Optional keywords for retrieval, as an array of strings."),
    importance: z
      .number()
      .min(1)
      .max(5)
      .optional()
      .describe("Importance level from 1 to 5. Default is 3."),
  }),
});

// 检索记忆工具
const memoryRetrieveTool: DynamicStructuredTool = tool(memoryRetrieveToolImpl, {
  name: "memory_retrieve",
  description:
    "Retrieve relevant memories from the database using full-text search. Use this when the user asks about something that may have been remembered before but is not in the current conversation context. Extract a few key keywords from the question and pass them as the query.",
  schema: z.object({
    query: z.array(z.string()).describe("Keywords to search for in memories."),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum number of memories to return. Default is 10."),
  }),
});

// 删除记忆工具
const memoryDeleteTool: DynamicStructuredTool = tool(memoryDeleteToolImpl, {
  name: "memory_delete",
  description:
    "Delete a memory from the database by its id. Use this when the user wants to forget or remove a specific memory.",
  schema: z.object({
    id: z.number().int().positive().describe("The id of the memory to delete."),
  }),
});

/**
 * 可能持久化输出，如果输出长度超过最大限制则保存到文件
 * @param {string} content - 要持久化的输出内容
 * @param {string} toolCallId - 工具调用 ID，用于生成文件名
 * @returns {Promise<string>} - 包含持久化信息的 HTML 片段
 */
export async function maybePersistedOutput(
  content: string,
  toolCallId: string,
): Promise<string> {
  const MAX_LENGTH = 50000;
  if (content.length <= MAX_LENGTH) {
    return content;
  }

  const id = toolCallId || Math.random().toString(36).slice(2, 9);
  const dir = resolve(process.cwd(), "./.tool_output");
  const filePath = resolve(dir, `tool_output_${id}.txt`);

  await mkdir(dir, { recursive: true });
  await writeFile(filePath, content, "utf-8");

  return `<persisted-output>
Output too large (${(content.length / 1024).toFixed(1)}KB).
Full output saved to: ${filePath}

If you need the complete content, it is recommended to read it in segments.

Preview (first 2KB):
${content.slice(0, 2000)}
...
</persisted-output>`;
}

// 导出所有工具
export const tools: DynamicStructuredTool[] = [
  readFileTool,
  writeFileTool,
  execTool,
  runJsTool,
  runPyTool,
  webSearchTool,
  webFetchTool,
  loadSkillTool,
  memoryCreateTool,
  memoryRetrieveTool,
  memoryDeleteTool,
];

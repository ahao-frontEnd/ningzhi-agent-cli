import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { readFileTool as readFileToolImpl } from "./read_file_tool";
import { writeFileTool as writeFileToolImpl } from "./write_file_tool";
import { execTool as execToolImpl } from "./exec_tool";
import { runJsTool as runJsToolImpl } from "./run_js_tool";
import { webSearchTool as webSearchToolImpl } from "./web_search_tool";

const readFileTool: DynamicStructuredTool = tool(readFileToolImpl, {
  name: "read_file",
  description: "Read the contents of a file in the current directory.",
  schema: z.object({
    filepath: z.string().describe("The relative path of the file to read."),
  }),
});

const writeFileTool: DynamicStructuredTool = tool(writeFileToolImpl, {
  name: "write_file",
  description:
    "Create or overwrite a file in the current directory. Will create parent directories if needed.",
  schema: z.object({
    filepath: z.string().describe("The relative path of the file to write."),
    content: z.string().describe("The content to write to the file."),
  }),
});

const execTool: DynamicStructuredTool = tool(execToolImpl, {
  name: "exec",
  description:
    "Execute a safe shell command in the current directory. Dangerous commands (rm, rmdir, etc.), absolute paths, and parent directory references are blocked.",
  schema: z.object({
    command: z.string().describe("The shell command to execute."),
  }),
});

const runJsTool: DynamicStructuredTool = tool(runJsToolImpl, {
  name: "run_js",
  description:
    "Execute JavaScript code using Node.js in the current directory. Returns stdout/stderr or error messages.",
  schema: z.object({
    code: z.string().describe("The JavaScript code to execute."),
  }),
});

const webSearchTool: DynamicStructuredTool = tool(webSearchToolImpl, {
  name: "web_search",
  description:
    "Search the web using Tavily. Useful for finding current information, news, and facts.",
  schema: z.object({
    query: z.string().describe("The search query."),
  }),
});

export const tools: DynamicStructuredTool[] = [
  readFileTool,
  writeFileTool,
  execTool,
  runJsTool,
  webSearchTool,
];

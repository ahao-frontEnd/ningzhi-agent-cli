import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { search as searchImpl } from "./search";
import { readFileTool as readFileToolImpl } from "./read_file_tool";
import { writeFileTool as writeFileToolImpl } from "./write_file_tool";
import { execTool as execToolImpl } from "./exec_tool";

const searchTool: DynamicStructuredTool = tool(searchImpl, {
  name: "search",
  description: "Call to surf the web.",
  schema: z.object({
    query: z.string().describe("The query to use in your search."),
  }),
});

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

export const tools: DynamicStructuredTool[] = [
  searchTool,
  readFileTool,
  writeFileTool,
  execTool,
];

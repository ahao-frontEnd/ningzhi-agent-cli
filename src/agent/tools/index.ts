import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { search as searchImpl } from "./search";
import { readFileTool as readFileToolImpl } from "./read_file_tool";

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

export const tools: DynamicStructuredTool[] = [searchTool, readFileTool];

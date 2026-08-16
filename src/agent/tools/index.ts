import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { search as searchImpl } from "./search";

export const search: DynamicStructuredTool = tool(searchImpl, {
  name: "search",
  description: "Call to surf the web.",
  schema: z.object({
    query: z.string().describe("The query to use in your search."),
  }),
});

import fs from "node:fs";
import path from "node:path";
import { discoverSkills, getSkillsListText } from "./skills";
import { WORKSPACE_DIR } from "./config";
import { listRecentMemories } from "./db";

/**
 *
 * 1. 基础提示词
 */
const basePrompt =
  "You are ningzhi, 中文名字叫柠智, a personal AI Agent like OpenClaw, including tools, skills, memory, hook, sub-agent, MCP server, etc. Run in the terminal.";

/**
 *
 * 2. 用户个人信息提示词
 */
function readProfile(): string {
  try {
    const filePath = path.join(WORKSPACE_DIR, ".data", "profile.md");
    const content = fs.readFileSync(filePath, "utf-8").trim();
    return `<profile_info>${content}</profile_info>`;
  } catch {
    return "<profile_info></profile_info>";
  }
}
const profilePrompt = `## User Profile

When you learn information about the user that fits the following categories, store it as profile information for future personalization.

<profile_template>
- Basic identity: name, nickname, gender, age, region, language
- Appearance: height, weight, skin tone, body type
- Personality and communication preferences
- Hobbies and interests
- Skills
- Work / occupation
</profile_template>

Here is the user's current profile information:
${readProfile()}`;

/**
 *
 * 3. 记忆管理规则提示词
 */
const memoryPrompt = `## Memory Management Rules

- When deleting a memory, first use memory_retrieve to find its id, then call memory_delete with that id. If no matching memory is found, politely inform the user.
- When updating a memory, first delete the old memory, then create a new one.
- When information fits the categories in <profile_template>, do not record it as a memory. It will be stored in the profile file instead.`;

/**
 *
 * 4. 当前时间提示词
 */
const dateTimePrompt = `## Current DateTime

${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`;

/**
 *
 * 5. skill 列表提示词
 */
discoverSkills();
const skillsText = getSkillsListText();

const skillList = skillsText
  ? `You have access to the following skills. When a user's request matches a skill's description, you MUST call the \`load_skill\` tool to load that skill's full instructions, then follow them.

${skillsText}`
  : "There are no skills available.";

const skillPrompt = `## Skills

${skillList}\n\nNote: If you want to add a new skill, it must be placed in the ${path.join(WORKSPACE_DIR, "skills")} directory.`;

/**
 *
 * 6. 任务规划提示词
 */
const todoPrompt = `## Task Planning

When a user's request is a complex, multi-step task (such as data analysis, writing a document, planning a task, or any task clearly requiring more than 3 steps), you MUST:
1. First call \`create_todo_list\` to create a structured plan with clear, actionable steps
2. Then execute each step one by one
3. After completing each step, call \`update_todo_status\` to mark it as completed (or failed if it didn't work)
4. Only provide the final answer after all steps are done

For simple, single-step tasks, do NOT use the todo list tools.`;

/**
 *
 *  长期记忆预加载
 *  缓存长期记忆
 */
let cachedMemories: ReturnType<typeof listRecentMemories> | null = null;
// 清空缓存
export function invalidateMemoryCache(): void {
  cachedMemories = null;
}

/**
 *
 *  组装系统提示词
 */
export function buildSystemPrompt(): string {
  if (!cachedMemories) {
    cachedMemories = listRecentMemories(10);
  }
  const memorySection =
    cachedMemories.length > 0
      ? `## Recent Memories\n\n${cachedMemories.map((m) => `- ${m.content}`).join("\n")}`
      : "";

  // `filter(Boolean)` 会把数组中所有“假值”（falsy values）剔除，
  // 主要包括：空字符串`""` 、`null` 、`undefined` 、`0` 、`false` 、`NaN` 。
  // ===》防止系统提示词中会出现无意义的空白段落，浪费 token 且影响结构清晰度
  return [
    basePrompt,
    profilePrompt,
    memorySection,
    memoryPrompt,
    skillPrompt,
    dateTimePrompt,
    todoPrompt,
  ]
    .filter(Boolean)
    .join("\n\n");
}

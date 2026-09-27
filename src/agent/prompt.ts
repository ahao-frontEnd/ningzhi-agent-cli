import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { discoverSkills, getSkillsListText } from "./skills";

discoverSkills();
const skillsText = getSkillsListText();

// 基础提示
const basePrompt =
  "You are a helpful assistant. Note that before answering any questions related to timeliness, first check the latest date and do not use your own expired date. For example, execute a 'new Date()' JS script to query";

// 读取用户个人信息
function readProfile(): string {
  try {
    const filePath = path.join(
      homedir(),
      ".ningzhiAgentCli",
      ".data",
      "profile.md",
    );
    const content = fs.readFileSync(filePath, "utf-8").trim();
    return `<profile_info>${content}</profile_info>`;
  } catch {
    return "<profile_info></profile_info>";
  }
}

// 用户个人信息提示
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

// 记忆管理规则
const memoryPrompt = `## Memory Management Rules

- When deleting a memory, first use memory_retrieve to find its id, then call memory_delete with that id. If no matching memory is found, politely inform the user.
- When updating a memory, first delete the old memory, then create a new one.
- When information fits the categories in <profile_template>, do not record it as a memory. It will be stored in the profile file instead.`;

// 组装系统提示词
export const systemPrompt = skillsText
  ? `${basePrompt}\n\n${profilePrompt}\n\n${memoryPrompt}\n\n
## Available Skills\n\nYou have access to the following skills. When a user's request matches a skill's description, you MUST call the \`load_skill\` tool to load that skill's full instructions, then follow them.\n\n${skillsText}`
  : `${basePrompt}\n\n${profilePrompt}\n\n${memoryPrompt}`;

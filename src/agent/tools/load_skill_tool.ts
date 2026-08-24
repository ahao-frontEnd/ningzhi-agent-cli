import { loadSkill } from "../skills";
import { formatToolLog } from "../colors";

// 根据 skill 名称 返回整个 SKILL.md 文件内容
export async function loadSkillTool({
  name,
}: {
  name: string;
}): Promise<string> {
  console.log(formatToolLog("load_skill", `"${name}"`));

  const trimmed = name.trim();
  if (!trimmed) {
    return "Error: skill name is empty.";
  }

  const content = loadSkill(trimmed);
  if (!content) {
    return `Error: skill "${trimmed}" not found.`;
  }

  return content;
}

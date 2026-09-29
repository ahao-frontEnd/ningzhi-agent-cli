import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface SkillInfo {
  name: string;
  description: string;
  dirPath: string;
}

const skills: SkillInfo[] = [];
const skillContentMap = new Map<string, string>();

// 解析 SKILL.md 文件顶部的 frontmatter(用 --- 包裹的 YAML 头)
// 提取其中的 name 和 description 字段,供技能注册使用
function parseFrontmatter(content: string): {
  name: string;
  description: string;
} {
  // 校验:必须以 "---" 开头,否则不是合法的 frontmatter
  if (!content.startsWith("---")) {
    return { name: "", description: "" };
  }
  // 查找闭合的 "---"(从索引 3 开始,跳过开头那一个)
  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) {
    return { name: "", description: "" };
  }
  // 截取两个 "---" 之间的内容,按行解析为 key-value 键值对
  const frontmatter = content.slice(3, endIdx).trim();
  const lines = frontmatter.split("\n");
  const result: Record<string, string> = {};
  for (const line of lines) {
    // 每行格式为 "key: value",没有冒号的行直接跳过
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    result[key] = value;
  }
  // 返回 name 和 description,缺失时回退为空字符串
  return { name: result.name || "", description: result.description || "" };
}

// 发现所有技能目录下的 SKILL.md 文件
export function discoverSkills(): SkillInfo[] {
  // 重置缓存:清空技能列表和内容映射,避免重复累积
  skills.length = 0;
  skillContentMap.clear();

  const skillDirs = [
    join(__dirname, "skills"), // cli 内置的 skill, 作为默认值
    join(homedir(), ".agents", "skills"), // 全局skill
    join(homedir(), ".ningzhiAgentCli", ".agents", "skills"), // 工作空间，第三方安装的skill
    join(homedir(), ".ningzhiAgentCli", "skills"), // 工作空间，用户自己创建的
  ];

  for (const skillsDir of skillDirs) {
    let entries: string[];
    try {
      entries = readdirSync(skillsDir); // 读取目录下的所有文件和子目录
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = join(skillsDir, entry); // entryPath 是当前目录下的文件或子目录路径,包含 skillsDir
      try {
        const entryStat = statSync(entryPath); // 获取文件或目录的元信息
        if (!entryStat.isDirectory()) continue;

        const skillMdPath = join(entryPath, "SKILL.md");
        const content = readFileSync(skillMdPath, "utf-8");
        const { name, description } = parseFrontmatter(content);
        if (name && description) {
          const existing = skills.find((s) => s.name === name);
          if (existing) {
            existing.description = description;
            existing.dirPath = entryPath;
          } else {
            skills.push({ name, description, dirPath: entryPath });
          }
          skillContentMap.set(name, content);
        }
      } catch {
        // 忽略没有 SKILL.md 的目录或解析失败的情况
      }
    }
  }

  return skills;
}

// 根据技能名称从缓存中加载完整的 SKILL.md 内容
export function loadSkill(name: string): string | null {
  return skillContentMap.get(name) ?? null;
}

// 生成技能列表的 Markdown 文本,用于展示给用户或 LLM
export function getSkillsListText(): string {
  // 将每个技能格式化为 Markdown 无序列表项: "- **技能名**: 描述"
  const lines = skills.map((s) => `- **${s.name}**: ${s.description}`);
  if (skills.length > 0) {
    lines.push("");
    lines.push("skills 的目录:");
    lines.push(join(homedir(), ".agents", "skills"));
    lines.push(join(homedir(), ".ningzhiAgentCli", ".agents", "skills"));
    lines.push(join(homedir(), ".ningzhiAgentCli", "skills"));
    lines.push(
      `如果增加新 skill，必须放在 ${join(homedir(), ".ningzhiAgentCli", "skills")} 目录下`,
    );
  }
  return lines.join("\n");
}

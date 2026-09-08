import path from "node:path";
import os from "node:os";
import dangerousPaths from "./dangerous-path.json";

/**
 * 展开路径中的特殊变量与符号，返回规范化后的绝对路径。
 * 支持：`~`、`%USERPROFILE%`、`%APPDATA%`、`%LOCALAPPDATA%` 以及相对路径。
 * @param filepath 待展开的路径字符串
 * @returns 规范化后的绝对路径
 */
function expandPath(filepath: string): string {
  let expanded = filepath;
  // 处理 Unix 风格的 home 目录简写 `~` 或 `~/xxx`
  if (expanded.startsWith("~")) {
    expanded = path.join(os.homedir(), expanded.slice(1));
  }
  // 展开 Windows 环境变量占位符（不区分大小写）
  expanded = expanded.replace(/%USERPROFILE%/gi, os.homedir());
  // 展开 Windows 环境变量占位符（不区分大小写）
  // 若未指定，使用默认值（用户 home 目录下的 AppData 目录）
  expanded = expanded.replace(
    /%APPDATA%/gi,
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
  );
  // 展开 Windows 环境变量占位符（不区分大小写）
  // 若未指定，使用默认值（用户 home 目录下的 AppData 目录下的 Local 目录）
  expanded = expanded.replace(
    /%LOCALAPPDATA%/gi,
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  );
  // 若展开后仍为相对路径，则以当前工作目录为基准转为绝对路径
  if (!path.isAbsolute(expanded)) {
    expanded = path.resolve(expanded);
  }
  // 规范化路径（消除 `..`、`.`、重复分隔符等）， 例如：
  // 将 `\\` 转换为 `/`
  // 将 `./` 转换为 `/`
  // 将 `/./` 转换为 `/`
  expanded = path.normalize(expanded);
  // 返回规范化后的路径
  return expanded;
}

/**
 * 将含通配符 `*` 的 glob 模式转换为正则表达式。
 * `*` 匹配除路径分隔符外的任意字符序列。
 * @param pattern glob 模式字符串
 * @returns 用于匹配路径的正则表达式
 */
function globToRegex(pattern: string): RegExp {
  // 先转义正则元字符，再将 `*` 转为 `[^\\/]*`
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^\\\\/]*");
  // 匹配 pattern 本身或其下的任意子路径
  return new RegExp(`^${escaped}(?:[\\\\/].*)?$`);
}

/**
 * 判断给定路径是否属于系统危险路径（如系统目录、用户家目录根等）。
 * 根据当前操作系统从 dangerous-path.json 中加载对应危险路径列表，
 * 支持通配符匹配与子路径匹配。
 * @param filepath 待检测的路径
 * @returns 若命中任一危险路径规则则返回 true，否则返回 false
 */
export function isDangerousPath(filepath: string): boolean {
  // 识别当前操作系统，映射为 JSON 中的平台键
  const platform =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "macos"
        : "linux";
  const dangerousList = dangerousPaths[platform];
  // 先对用户输入路径做展开与规范化，确保后续比较基准一致
  const expandedInput = expandPath(filepath);
  // 遍历危险路径列表，检查是否命中任何规则
  // 若命中则返回 true，否则返回 false
  for (const dangerous of dangerousList) {
    const expandedDangerous = expandPath(dangerous);
    // 检查是否命中通配符规则
    if (dangerous.includes("*")) {
      // 含通配符的规则：使用正则进行匹配
      const regex = globToRegex(expandedDangerous);
      if (regex.test(expandedInput)) return true;
    } else {
      // 精确规则：路径完全相同，或是其子路径（以 dangerous + 分隔符 开头）
      if (expandedInput === expandedDangerous) return true;
      // 检查是否命中子路径规则
      // 若以 dangerous + 分隔符 开头，返回 true，  path.sep 为分隔符
      if (expandedInput.startsWith(expandedDangerous + path.sep)) return true;
    }
  }
  // 若未命中任何规则，返回 false
  return false;
}

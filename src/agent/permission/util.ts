import path from "node:path";

export function isInProjectDir(filepath: string): boolean {
  const resolved = path.resolve(filepath);
  const cwd = path.resolve(process.cwd());
  return resolved === cwd || resolved.startsWith(cwd + path.sep);
}

/*
    `(?:...)` 的`?:` 表示 非捕获组 ，只分组不保存匹配内容，
    比普通`()` 开销略小且不污染`match()` 结果，
    是纯布尔判断（`.test()` ）场景下的惯用写法。
*/
export function isChangingDirectory(command: string): boolean {
  return /(?:^|[\s;|&])(?:cd|chdir|pushd|popd)(?:\s|$)/i.test(command);
}

const PYTHON_TOOLS = ["python", "python3", "python2"];
const JS_TOOLS = ["node", "nodejs", "tsx", "ts-node"];
const OTHER_LANG_TOOLS = [
  "java",
  "javac",
  "dotnet",
  "go",
  "cargo",
  "rustc",
  "ruby",
  "php",
  "perl",
  "lua",
  "rscript",
];
// 非 shell/bash/sh 脚本的文件扩展名
const BLOCKED_EXTENSIONS = [
  ".py",
  ".js",
  ".ts",
  ".mjs",
  ".cjs",
  ".java",
  ".cs",
  ".go",
  ".rb",
  ".rs",
  ".php",
  ".pl",
  ".lua",
];
// 获取命令的第一个 token
// const trimmed = "git commit -m 'hello'" ;
// trimmed.match ( /^([^\s]+)/ );    // ---> match[1] === "git"
function getFirstToken(command: string): string {
  const trimmed = command.trim();
  const match = trimmed.match(/^([^\s]+)/);
  return match ? match[1] : trimmed;
}

export function isScriptExecution(command: string): {
  blocked: boolean;
  reason?: string;
} {
  // 把一条可能包含 多段 shell 命令链 的输入，拆分成单个子命令
  // "ls && npm test; echo done".split( /[;|&]+/ ).filter( Boolean )
  // --→  ["ls ", " npm test", " echo done"]
  const subCommands = command.split(/[;|&]+/).filter(Boolean);

  for (const sub of subCommands) {
    const token = getFirstToken(sub);
    const tool = path.basename(token).toLowerCase();
    const ext = path.extname(token).toLowerCase();

    if (PYTHON_TOOLS.includes(tool) || ext === ".py") {
      return {
        blocked: true,
        reason: "检测到 Python 脚本执行，请使用 run_py tool 执行 Python 代码。",
      };
    }

    if (
      JS_TOOLS.includes(tool) ||
      [".js", ".ts", ".mjs", ".cjs"].includes(ext)
    ) {
      return {
        blocked: true,
        reason:
          "检测到 JavaScript/TypeScript 脚本执行，请使用 run_js tool 执行 JavaScript/TypeScript 代码。",
      };
    }

    if (OTHER_LANG_TOOLS.includes(tool) || BLOCKED_EXTENSIONS.includes(ext)) {
      return {
        blocked: true,
        reason: `检测到 ${tool || ext} 脚本执行，exec tool 仅允许执行 shell/bash/sh 脚本。`,
      };
    }
  }

  return { blocked: false };
}

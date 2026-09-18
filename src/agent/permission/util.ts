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

// ==========================================================================

// exec tool 中不能执行 py js 等脚本语言
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

// ===============================================================================================

// 允许的命令
const SAFE_COMMANDS = [
  "ls",
  "pwd",
  "cat",
  "head",
  "tail",
  "grep",
  "find",
  "echo",
  "date",
  "whoami",
  "id",
  "uname",
  "wc",
  "sort",
  "uniq",
  "diff",
  "which",
  "whereis",
  "file",
  "stat",
  "df",
  "du",
  "ps",
  "pgrep",
  "pstree",
  "uptime",
  "hostname",
  "printf",
  "readlink",
  "realpath",
  "tput",
  "clear",
  "reset",
  "seq",
  "yes",
  "true",
  "false",
  "dir",
  "type",
  "findstr",
  "more",
  "tree",
  "ver",
  "vol",
  "gci",
  "gc",
  "gl",
  "sls",
  "write",
];
// 允许的 git 子命令
const SAFE_GIT_SUBCOMMANDS = ["status", "diff", "log"];
// 获取命令的第二个 token
function getSecondToken(command: string): string | null {
  const tokens = command.trim().split(/\s+/);
  return tokens[1] || null;
}
// 检查命令是否安全
export function isSafeCommand(command: string): boolean {
  if (hasOutputRedirect(command)) return false;

  const subCommands = command.split(/[;|&]+/).filter(Boolean);

  for (const sub of subCommands) {
    const token = getFirstToken(sub);
    const tool = path.basename(token).toLowerCase();

    if (SAFE_COMMANDS.includes(tool)) {
      continue;
    }

    if (tool === "git") {
      const subCommand = getSecondToken(sub)?.toLowerCase();
      if (subCommand && SAFE_GIT_SUBCOMMANDS.includes(subCommand)) {
        continue;
      }
    }

    return false;
  }

  return true;
}

// ===============================================================================================

// 阻止危险命令
const DANGEROUS_COMMANDS = [
  "sudo",
  "doas",
  "rm",
  "rmdir",
  "unlink",
  "shred",
  "del",
  "erase",
  "rd",
  "remove-item",
  "clear-item",
  "mv",
  "move",
  "rename",
  "ren",
  "cp",
  "copy",
  "xcopy",
  "robocopy",
  "touch",
  "dd",
  "truncate",
  "tee",
  "mkdir",
  "md",
  "mkfifo",
  "mknod",
  "new-item",
  "chmod",
  "chown",
  "chgrp",
  "umask",
  "setfacl",
  "chflags",
  "icacls",
  "cacls",
  "takeown",
  "attrib",
  "kill",
  "killall",
  "pkill",
  "xkill",
  "systemctl",
  "service",
  "launchctl",
  "init",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "crontab",
  "at",
  "batch",
  "taskkill",
  "sc",
  "net",
  "netsh",
  "stop-process",
  "start-process",
  "restart-computer",
  "useradd",
  "usermod",
  "userdel",
  "groupadd",
  "groupmod",
  "groupdel",
  "passwd",
  "chsh",
  "chfn",
  "chage",
  "su",
  "runas",
  "dscl",
  "dseditgroup",
  "env",
  "printenv",
  "history",
  "ssh",
  "scp",
  "sftp",
  "ftp",
  "telnet",
  "nc",
  "netcat",
  "ncat",
  "curl",
  "wget",
  "nmap",
  "masscan",
  "zmap",
  "iptables",
  "ufw",
  "firewall-cmd",
  "nft",
  "socat",
  "proxychains",
];

// 匹配「外层 shell 再包一层」的调用形态，如：
//   bash -c "rm -rf /"        → -c   分支，内层命令落在捕获组 1
//   cmd /c "del C:\data"      → /c   分支，内层命令落在捕获组 2
//   powershell -Command "..." → -Command 分支，内层命令落在捕获组 3
// 三个分支共用 ("..."|'...'|\S+) 抓取内层命令体，(?:...) 为非捕获组
const SHELL_COMMAND_SWITCH =
  /(?:bash|sh|zsh|cmd|powershell)\s+(?:-c\s+(".*?"|'.*?'|\S+)|\/c\s+(".*?"|'.*?'|\S+)|-Command\s+(".*?"|'.*?'|\S+))/i;

// 去掉首尾成对的引号
// `"abc"` → abc，`'abc'` → abc，`abc` → abc（原样返回）
function unquote(str: string): string {
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    return str.slice(1, -1);
  }
  return str;
}

// 从 bash -c "..." / cmd /c "..." / powershell -Command "..." 中剥出内层命令
// 取非空的第一个捕获组（哪个分支匹配成功就用哪个），再去掉引号
function extractShellSubCommand(command: string): string | null {
  const match = command.match(SHELL_COMMAND_SWITCH);
  if (!match) return null;
  return unquote(match[1] || match[2] || match[3] || "");
}

// 检测输出重定向（覆盖 `> file`、`>> file`、`2> file` 等形态）
// (^|[\s;|&])  →  重定向符必须出现在开头或分隔符之后，避免误伤 `a>b` 这类比较写法
// \d?          →  可选的文件描述符编号（2> 1>）
// >>?          →  覆盖覆盖写 `>` 与追加写 `>>`；\s 要求后面跟空白
function hasOutputRedirect(command: string): boolean {
  return /(^|[\s;|&])\d?>>?\s/.test(command);
}

export function isDangerousOperation(command: string): {
  blocked: boolean;
  reason?: string;
} {
  // 第一步：穿透「shell 包一层」的伪装
  // "bash -c 'rm -rf /'" 本身第一个 token 是 bash（不在黑名单），
  // 必须先剥出内层命令，递归检查一遍才能发现里面的 rm
  const subCommand = extractShellSubCommand(command);
  if (subCommand) {
    const result = isDangerousOperation(subCommand);
    if (result.blocked) return result;
  }

  // 第二步：拆分命令链，逐段检查第一个 token 是否命中黑名单
  // "ls && rm -rf /tmp" → ["ls ", " rm -rf /tmp"] → 第二段命中 rm
  const subCommands = command.split(/[;|&]+/).filter(Boolean);

  for (const sub of subCommands) {
    const token = getFirstToken(sub);
    const tool = path.basename(token).toLowerCase();

    if (DANGEROUS_COMMANDS.includes(tool)) {
      return {
        blocked: true,
        reason: `检测到危险操作 "${tool}"，exec tool 禁止执行该命令。如有需要请手动操作。`,
      };
    }
  }

  // 第三步：检查输出重定向（> 会改写文件系统，同样属于危险操作）
  if (hasOutputRedirect(command)) {
    return {
      blocked: true,
      reason:
        "检测到输出重定向，exec tool 禁止修改文件系统。如有需要请手动操作。",
    };
  }

  return { blocked: false };
}

// ==========================================================================

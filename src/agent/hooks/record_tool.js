// PostToolUse hook: 记录工具名与参数到 tools.log（node 版，跨平台，替代 record_tool.js/sh）
const fs = require("fs");
const path = require("path");

// 日志固定写到本脚本所在目录，不受 hook 运行时 cwd 影响
const LOG_FILE = path.join(__dirname, "tools.log");

// 从环境变量取工具名与参数，未设置时用默认值兜底
const NAME = process.env.NINGZHI_TOOL_NAME || "unknown";
const ARGS = process.env.NINGZHI_TOOL_ARGS || "{}";

// 生成可读时间戳，如 2026-09-19 14:30:00
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const TIMESTAMP = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
  now.getDate(),
)} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

// 追加一行记录：[时间] name=工具名 args=参数JSON
fs.appendFileSync(
  LOG_FILE,
  `[${TIMESTAMP}] name=${NAME} args=${ARGS}\n`,
);

process.exit(0);

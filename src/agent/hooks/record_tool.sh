#!/bin/bash
# PostToolUse hook: record tool name and args to tools.log

# 任一步骤失败立即退出，避免错误被吞掉
set -e

# 日志路径基于脚本自身所在目录（$0 = 脚本路径），
# 不受 hook 运行时 cwd 影响，保证日志位置稳定
LOG_FILE="$(dirname "$0")/tools.log"

# 从环境变量取工具名与参数，未设置时用默认值兜底
NAME="${NINGZHI_TOOL_NAME:-unknown}"
ARGS="${NINGZHI_TOOL_ARGS:-{}}"

# 生成可读的时间戳，如 2026-09-19 14:30:00
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

# 追加一行记录到日志：[时间] name=工具名 args=参数JSON
printf '[%s] name=%s args=%s\n' "$TIMESTAMP" "$NAME" "$ARGS" >> "$LOG_FILE"
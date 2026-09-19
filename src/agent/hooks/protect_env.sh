#!/bin/bash
# PreToolUse hook: block attempts to read .env files

# 任一步骤失败立即退出，避免错误被吞掉
set -e

# 未传入工具参数（非带参工具调用）时直接放行
if [ -z "$NINGZHI_TOOL_ARGS" ]; then
  exit 0
fi

# 工具参数是 JSON 字符串，借助 node 解析出其中的 filepath 字段
# 解析失败（非合法 JSON）时静默退出，不阻断工具执行
filepath=$(node -e "try { console.log(JSON.parse(process.env.NINGZHI_TOOL_ARGS).filepath || '') } catch { process.exit(0) }")

# 参数里没有 filepath 字段时放行
if [ -z "$filepath" ]; then
  exit 0
fi

# 只取文件名（忽略路径），例如 /a/b/.env → .env
basename=$(basename "$filepath")

# 命中 .env 文件名：stderr 输出拦截原因 + exit 1 表示 block
if [ "$basename" = ".env" ]; then
  echo "Blocked: reading .env files is not allowed." >&2
  exit 1
fi

# 其余情况 exit 0：continue，正常放行
exit 0
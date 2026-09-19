// PreToolUse hook: 拦截读取 .env 文件（node 版，跨平台，替代 protect_env.sh）
// 退出码约定（与 engine.ts 的 runHook 一致）：0=放行 1=block(stderr 作为原因) 2=inject

let args = {};
try {
  args = JSON.parse(process.env.NINGZHI_TOOL_ARGS || "{}");
} catch {
  // 参数不是合法 JSON 时放行，不阻断工具执行
  process.exit(0);
}

// 只取文件名（兼容 / 和 \ 路径分隔符），例如 /a/b/.env → .env
const basename = String(args.filepath || "").split(/[\\/]/).pop() || "";

// 没有 filepath 字段时放行
if (!basename) process.exit(0);

// 命中 .env 文件名：stderr 输出拦截原因 + exit 1 表示 block
// 注意是精确匹配，.env.example / .env.local 不会被拦
if (basename === ".env") {
  console.error("Blocked: reading .env files is not allowed.");
  process.exit(1);
}

// 其余情况 exit 0：continue，正常放行
process.exit(0);

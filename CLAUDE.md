# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在本仓库中工作时提供指引。

## 项目概览

**ningzhiAgentCli**（命令行名：`ningzhi`）——一个运行在终端中的个人 AI Agent（灵感来自 OpenClaw）。它是基于 LangGraph 构建的流式、有状态 ReAct 风格智能体，具备文件/Shell/Web 工具、技能（skills）系统、SQLite 持久化的长期记忆、权限管控、生命周期 hooks、子智能体（sub-agent）以及 MCP 服务接入能力。

## 技术栈

- **运行时**：Node.js（TypeScript，`target: ES2020`，`module: CommonJS`）
- **包管理器**：pnpm
- **Agent 框架**：LangGraph（`@langchain/langgraph`、`langchain`、`@langchain/core`）
- **LLM 客户端**：`@langchain/openai`，对接任意 OpenAI 兼容的 Chat Completions 接口（Moonshot Kimi、通义千问、DeepSeek、智谱 GLM、MiniMax、小米 MiMo 等）
- **持久化**：`better-sqlite3`——LangGraph `SqliteSaver` 检查点（checkpoints）+ 记忆表 + SQLite FTS5 全文检索
- **MCP**：`@modelcontextprotocol/sdk`（支持 stdio 和 streamable-HTTP 两种传输方式）
- **工具参数校验**：`zod`
- **联网搜索**：Tavily（`@langchain/tavily`，密钥通过 `TAVILY_API_KEY` 配置）
- **CLI / 终端界面**：commander.js、Node `readline`、chalk、figlet、boxen、cli-table3
- **配置 / 环境变量**：`dotenv` + 用户级 JSON 配置文件

## 配置

所有运行时数据都位于 `~/.ningzhiAgentCli/` 下。必需的配置文件是 `~/.ningzhiAgentCli/ningzhi.json`：

```json
{
  "model": {
    "model": "kimi-k2.6",
    "apiKey": "xxx",
    "baseURL": "https://api.moonshot.cn/v1"
  },
  "env": {
    "TAVILY_API_KEY": "xxx"
  },
  "hooks": {
    "PreToolUse": [{ "matcher": "*", "command": "node hooks/example.js" }],
    "PostToolUse": [],
    "SessionStart": []
  },
  "mcpServers": {
    "example-stdio": { "command": "npx", "args": ["-y", "some-mcp-server"] },
    "example-http": { "url": "https://example.com/mcp", "headers": {} }
  }
}
```

`~/.ningzhiAgentCli/` 下的数据布局：

- `ningzhi.json`——model / env / hooks / mcpServers 配置（只加载一次并缓存）
- `.dbData/checkpointer.db`——SQLite 数据库：LangGraph 检查点、`memory` 表、`memory_fts` FTS5 虚拟表及同步触发器
- `.data/profile.md`——用户画像文件，agent 可通过 `profile_update` 工具更新
- `.tool_output/`——超过 50 KB 的工具输出会持久化到这里，而不是直接塞进模型上下文
- `skills/`——用户自建技能；`.agents/skills/`——第三方安装的技能
- 技能发现还会覆盖全局目录 `~/.agents/skills` 和内置目录 `src/agent/skills/`

一个技能就是一个包含 `SKILL.md` 的目录，文件顶部的 YAML frontmatter 需声明 `name` 和 `description`。目前内置技能为 `planner` 和 `oppose`。

## 常用命令

```bash
pnpm dev            # 通过 ts-node 运行 src/index.ts（交互式对话）
pnpm start          # 运行构建产物：node dist/index.js
pnpm test           # 一次性运行全部 Jest 测试
pnpm test:watch     # Jest watch 模式
pnpm test:coverage  # 运行测试并生成覆盖率报告（输出到 ./coverage/）
pnpm build          # 先用 tsc 编译 TypeScript 到 ./dist，再复制内置技能（copy:skills）
pnpm clean          # 删除 ./dist
```

**运行单个测试文件：**

```bash
pnpm test src/agent/tools/exec_tool.test.ts
```

**按名称模式运行单个测试：**

```bash
pnpm test -t "should block dangerous commands"
```

Jest 配置位于 [jest.config.cjs](jest.config.cjs)（`ts-jest` 预设、`**/*.test.ts` 匹配规则、Node 测试环境、`maxWorkers: 1`）。测试串行执行，因为记忆相关的测试共用同一个 SQLite 数据库文件，并行会互相干扰。TypeScript 配置位于 [tsconfig.json](tsconfig.json)；测试文件不参与 `tsc` 编译。

**构建说明：** `tsc` 不会输出非 TS 文件，因此 `build` 脚本在编译后执行 `copy:skills`，把 `src/agent/skills/` 递归复制到 `dist/agent/skills/`，以保证内置技能在编译产物中可用。该复制是合并式的——如果删除或重命名了内置技能，重新构建前请先执行 `pnpm clean`，因为 `dist/` 中的残留文件不会被自动清理。

**交互式对话用法**（不带命令行参数启动时进入）：

- 直接输入消息即可对话；输入 `exit` 退出；按 `ESC` 中断正在进行的 AI 请求
- 斜杠命令：`/new`（新建会话）、`/sessions`（列出最近会话）、`/rewind <thread_id>`（恢复指定会话）、`/compact`（立即压缩上下文）

## 代码架构

入口文件 [src/index.ts](src/index.ts)：初始化终端配色、SQLite 数据库和 agent（工具 + 图）；注册一次性的 `SIGINT` 处理器，在退出前断开所有 MCP 子进程连接。不带参数时进入交互式对话；带参数时交给 commander 解析。

所有 agent 代码都在 [src/agent/](src/agent/) 下：

- **[agent.ts](src/agent/agent.ts)**——核心。用 LangGraph `StateGraph` 编译出包含两个节点的图：`model_request` ⇄ `tools`（`START → model_request`，条件边走向 `tools` 或 `END`，`tools → model_request`）。状态包含 `messages`、`contextSummary`、`compressionCount`、`lastCompressedIndex`。关键行为：
  - `SqliteSaver` 按 `thread_id` 保存检查点，因此会话可以自动续接
  - 通过 `streamMode: "messages"` 流式输出，并过滤出 `model_request` 节点产生的 token 块
  - 需要用户确认的工具调用通过 `interrupt()` 暂停图执行，CLI 再用 `Command({ resume: "approved" | "denied" })` 恢复
  - 每次工具调用都会经过权限检查和 PreToolUse/PostToolUse hooks
  - 编译出两个图：主 agent 和**子 agent**；子 agent 拥有除 `agent_tool` 外的全部工具（禁止递归委派），且工具调用自动确认
  - 旧的工具消息会被简化（只完整保留最近 3 个），并硬性保留最近 500 条消息作为兜底上限
- **[cli.ts](src/agent/cli.ts)**——readline 交互式 REPL：figlet/boxen 启动横幅、token 流式打印、ESC 中断（`AbortController`）、每轮对话后展示 token 用量与模型上下文上限的对比。用量达到 80% 时发出警告并自动执行上下文压缩。
- **[commands.ts](src/agent/commands.ts)**——斜杠命令注册表，以及可变的当前 `threadId`。
- **[tools.ts](src/agent/tools.ts)**——注册 13 个原生工具，为每个工具标记 `permission_level`，追加动态发现的 MCP 工具，并实现 `maybePersistedOutput`（输出超过 50 KB 时落盘，只返回 2 KB 预览）。
- **[tools/](src/agent/tools)**——一个工具一个文件，与对应的 `*.test.ts` 放在一起：
  - 文件/进程：`read_file`、`write_file`、`exec`（仅允许 shell 命令）、`run_js`、`run_py`
  - 联网：`web_search`（Tavily）、`web_fetch`
  - 技能/记忆：`load_skill`、`memory_create`、`memory_retrieve`、`memory_delete`、`profile_update`
  - `agent_tool`——把独立任务委派给子 agent 执行
- **[permission/](src/agent/permission)**——权限等级分为 `read`、`write`、`exec`、`network`、`mcp`、`db`；[agent.ts](src/agent/agent.ts) 把每次调用分发给对应的检查器（`read.ts` / `write.ts` / `exec.ts` / `network.ts`；`mcp` 一律要求用户确认，`db`/未知等级直接放行）。检查内容包括：项目目录限定、危险命令黑名单（并能穿透 `bash -c`、`cmd /c` 等 shell 包装进行递归检查）、输出重定向检测、`exec` 中禁止脚本语言（Python/JS 必须走 `run_py` / `run_js`）、安全域名白名单（`is-safe-domains.ts`）、危险路径数据（`dangerous-path.json` + `is-dangerous-path.ts`）。
- **[hooks/](src/agent/hooks)**——在 `ningzhi.json` 中配置的外部命令钩子，按工具名匹配（`*` 匹配全部）。hook 命令以 `~/.ningzhiAgentCli` 为 cwd 执行，上下文通过环境变量传入。退出码协议：`0` = 继续，`1` = 阻止（stderr 作为工具错误返回给模型），`2` = 注入（stderr 注入对话上下文，工具仍执行）。类型：`PreToolUse`、`PostToolUse`、`SessionStart`。
- **[mcp/](src/agent/mcp)**——连接所有已配置的 MCP 服务（stdio 子进程或 streamable HTTP），把每个远端工具包装成权限等级为 `mcp` 的 `NingzhiTool`，并在退出时关闭全部连接（`client.ts`、`wrapper.ts`）。
- **[skills.ts](src/agent/skills.ts)**——从四个技能目录发现 `SKILL.md`（同名时靠后的目录覆盖靠前的），解析 frontmatter，并生成注入系统提示词的可用技能列表。
- **[db.ts](src/agent/db.ts)**——建表、FTS5 触发器、加权记忆检索（BM25 相关性 0.6 + 重要度 0.3 + 时间新鲜度 0.1）、最近会话列表、`thread_id` 存在性检查。
- **[context.ts](src/agent/context.ts)**——各模型上下文窗口大小对照表、用 LLM 生成滚动摘要，以及 `findSafeCompressionIndex`——通过前移压缩边界，保证 `AIMessage(tool_calls)` 与其 `ToolMessage` 不会被切散。
- **[prompt.ts](src/agent/prompt.ts)**——组装系统提示词：基础指令、来自 `.data/profile.md` 的用户画像、记忆管理规则、可用技能列表。
- **[model.ts](src/agent/model.ts)**——根据配置创建 `ChatOpenAI` 客户端（默认开启流式，通过 `modelKwargs` 关闭模型的 thinking 深度思考模式）。
- **[config.ts](src/agent/config.ts)**——`ningzhi.json` 的带缓存加载与校验，并提供 model、env、hooks、mcpServers 的类型化 getter。
- **[colors.ts](src/agent/colors.ts)** / **[utils.ts](src/agent/utils.ts)**——终端样式和通用格式化辅助函数。

扩展 agent 时，请沿用现有的分层方式：在 [tools.ts](src/agent/tools.ts) 中注册工具并显式指定 `permission_level`；需要管控时在 [permission/](src/agent/permission) 中补充检查逻辑；LangGraph 的图编排保持收敛在 [agent.ts](src/agent/agent.ts) 内，不要泄漏到 CLI 入口。

## 约定

- **拼写**：VSCode cSpell 配置 [.vscode/settings.json](.vscode/settings.json) 已白名单项目专用词汇（`ningzhi`、`kimi`、`langchain`、`langgraph`、`tavily`、各模型名等）——请使用这些拼写。
- **注释**：现有代码有大量中文注释；编辑文件时请与所在文件的注释语言保持一致。
- **测试**：测试以 `*.test.ts` 形式与源文件放在一起。不要假设测试可以并行——由于共用 SQLite 文件，Jest 配置为 `maxWorkers: 1` 串行执行。提 PR 前请运行 `pnpm test:coverage`，保持 `src/**/*.ts` 的覆盖率。
- **构建产物**：TypeScript 编译到 `./dist/`（已 gitignore）。包的 bin 为 `ningzhi` → `dist/index.js`，类型声明在 `dist/index.d.ts`。
- **依赖**：`better-sqlite3` 是原生模块，pnpm 已配置构建它（`onlyBuiltDependencies`）。请在宿主机（Windows）上安装依赖，不要在容器内安装，以避免 junction / 原生构建问题。

## 行为准则

**权衡：** 以下规则倾向于谨慎而非速度。对于琐碎任务，可自行判断。

### 1. 编码前先思考

**不要臆测。不要掩盖困惑。把权衡摆到台面上。**

动手之前：

- 明确陈述你的假设。不确定就问。
- 如果存在多种理解，把它们都列出来——不要默默选一个。
- 如果有更简单的方案，直接说出来。该反驳时就反驳。
- 如果有什么不清楚，停下来。指出困惑点，然后提问。

### 2. 简单优先

**用解决问题的最少代码。不做任何投机性的东西。**

- 不做需求之外的功能。
- 不为只用一次的代码做抽象。
- 不做没人要求的"灵活性"或"可配置性"。
- 不为不可能发生的场景做错误处理。
- 如果你写了 200 行而 50 行就能解决，重写它。

自问："一个资深工程师会觉得这过度复杂吗？"如果是，就简化。

### 3. 外科手术式修改

**只碰必须碰的。只清理自己造成的烂摊子。**

修改既有代码时：

- 不要"顺手改进"相邻的代码、注释或格式。
- 不要重构没坏的东西。
- 匹配既有风格，即使你会用不同的写法。
- 如果发现了与本次无关的死代码，指出来——不要删掉。

当你的改动产生了孤儿代码时：

- 删除因你的改动而变得无用的 import/变量/函数。
- 除非被明确要求，不要删除此前就存在的死代码。

检验标准：每一行改动都能直接追溯到用户的需求。

### 4. 目标驱动的执行

**定义成功标准。循环验证直到达成。**

把任务转化为可验证的目标：

- "加校验" → "为非法输入写测试，然后让测试通过"
- "修 bug" → "先写一个能复现 bug 的测试，然后让它通过"
- "重构 X" → "确保重构前后测试都通过"

对于多步骤任务，先给出简短计划：

```
1. [步骤] → 验证：[检查方式]
2. [步骤] → 验证：[检查方式]
3. [步骤] → 验证：[检查方式]
```

清晰的成功标准让你可以独立循环推进。模糊的标准（"让它能跑"）则需要反复确认。

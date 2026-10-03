# 长期记忆系统设计

本文档记录 ningzhi-agent-cli 中长期记忆（Long-Term Memory）系统的设计与实现。该系统允许 agent 跨会话记住用户的事实、事件、偏好和技能，并在后续对话中主动检索使用。

## 概述

长期记忆系统由四个核心部分组成：

1. **存储层**（[`src/agent/db.ts`](../src/agent/db.ts)）— SQLite + FTS5 全文搜索引擎
2. **工具层**（[`src/agent/tools/memory_*.ts`](../src/agent/tools)）— 三个标准工具供 LLM 调用
3. **预加载层**（[`src/agent/prompt.ts`](../src/agent/prompt.ts)）— 每轮对话自动注入最近记忆到系统提示词
4. **提示词层**（[`src/agent/prompt.ts`](../src/agent/prompt.ts)）— 指导 LLM 何时创建/检索/删除记忆

## 存储层：SQLite + FTS5

### 数据库路径

```typescript
// db.ts:7-12
export const DB_PATH = join(
  homedir(),
  ".ningzhiAgentCli",
  ".dbData",
  "checkpointer.db",
);
```

数据库文件存储在用户主目录下的 `.ningzhiAgentCli/.dbData/` 中，与会话 checkpoint 共用同一个 SQLite 文件。

### 表结构

**`memory` 表** — 存储记忆的主体数据：

| 字段         | 类型                              | 说明                                                |
| ------------ | --------------------------------- | --------------------------------------------------- |
| `id`         | INTEGER PRIMARY KEY AUTOINCREMENT | 自增 ID                                             |
| `type`       | TEXT                              | 记忆类型：`fact` / `event` / `preference` / `skill` |
| `content`    | TEXT                              | 记忆内容（自然语言描述）                            |
| `keywords`   | TEXT                              | 关键词数组（JSON 字符串，可选）                     |
| `importance` | INTEGER                           | 重要程度 1-5，默认 3                                |
| `session_id` | TEXT                              | 所属会话 ID                                         |
| `created_at` | DATETIME                          | 创建时间                                            |
| `updated_at` | DATETIME                          | 更新时间                                            |

**`memory_fts` 虚拟表** — FTS5 全文搜索索引：

```sql
CREATE VIRTUAL TABLE memory_fts USING fts5(
  content,
  keywords,
  content='memory', content_rowid='id'
)
```

- 索引 `content` 和 `keywords` 两个字段
- 通过 `content='memory'` 关联到主表，实现数据同步

**同步触发器** — 自动维护 FTS 索引：

```sql
-- 插入时同步到 FTS
CREATE TRIGGER memory_fts_insert AFTER INSERT ON memory BEGIN
  INSERT INTO memory_fts(rowid, content, keywords)
  VALUES (new.id, new.content, new.keywords);
END;

-- 删除时同步删除 FTS
CREATE TRIGGER memory_fts_delete AFTER DELETE ON memory BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, content, keywords)
  VALUES ('delete', old.id, old.content, old.keywords);
END;

-- 更新时先删后插
CREATE TRIGGER memory_fts_update AFTER UPDATE ON memory BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, content, keywords)
  VALUES ('delete', old.id, old.content, old.keywords);
  INSERT INTO memory_fts(rowid, content, keywords)
  VALUES (new.id, new.content, new.keywords);
END;
```

## 检索算法：多因子加权评分

记忆检索的核心是 `searchMemories` 函数（[`db.ts:38-95`](../src/agent/db.ts#L38-L95)），采用**三因子加权评分**：

```sql
WITH ranked AS (
  SELECT
    m.*,
    -bm25(memory_fts, 10.0, 5.0) AS relevance_score,      -- BM25 相关性
    (m.importance * 0.3) AS importance_score,             -- 重要程度
    (1.0 / (1.0 + (days_since_update))) AS time_score     -- 时间衰减
  FROM memory_fts
  JOIN memory m ON m.id = memory_fts.rowid
  WHERE memory_fts MATCH ?
)
SELECT *,
  (relevance_score * 0.6 + importance_score * 0.3 + time_score * 0.1) AS final_score
FROM ranked
ORDER BY final_score DESC
LIMIT ?
```

### 三因子说明

| 因子                            | 权重 | 计算方式                       | 说明                                                                |
| ------------------------------- | ---- | ------------------------------ | ------------------------------------------------------------------- |
| **相关性** (`relevance_score`)  | 60%  | `-bm25(memory_fts, 10.0, 5.0)` | BM25 算法衡量查询与记忆的文本相关度，负号是因为 bm25 返回越小越相关 |
| **重要性** (`importance_score`) | 30%  | `importance * 0.3`             | 用户标记的重要程度（1-5），越重要越优先                             |
| **时效性** (`time_score`)       | 10%  | `1.0 / (1.0 + days)`           | 时间衰减函数，最近更新的记忆得分更高                                |

### 查询构造

```typescript
// db.ts:42-46
const trimmedQueries = query.map((q) => q.trim()).filter((q) => q.length > 0);
const queryStr = trimmedQueries.join(" OR ").replace(/-/g, " ");
```

- 支持多关键词查询，用 `OR` 连接
- 将 `-` 替换为空格（FTS5 中 `-` 是特殊字符，表示排除）

### 最近记忆列表

除了全文检索，还提供 `listRecentMemories` 函数（[`db.ts:97-127`](../src/agent/db.ts#L97-L127)）用于按时间倒序获取最近的记忆：

```sql
SELECT * FROM memory
ORDER BY updated_at DESC
LIMIT ?
```

| 项目       | 说明                                                             |
| ---------- | ---------------------------------------------------------------- |
| 用途       | 获取最近更新的记忆，用于系统提示词预加载                         |
| 排序       | 按 `updated_at DESC`（最近更新的在前）                           |
| 默认 limit | 10                                                               |
| 返回       | `MemorySearchResult[]`（`final_score` 固定为 0，因为未参与评分） |

与 `searchMemories` 的区别：`listRecentMemories` 不做全文匹配，只按时间排序取最近 N 条，用于"广撒网"式的记忆预加载。

## 工具层：三个标准工具

### 1. `memory_create` — 创建记忆

```typescript
// memory_create_tool.ts
memoryCreateTool({
  type: "fact" | "event" | "preference" | "skill",
  content: string,
  keywords?: string[],
  importance?: number  // 1-5，默认 3
})
```

**参数校验**：

- `type` 必须是四种类型之一
- `content` 不能为空
- `importance` 必须在 1-5 范围内

**实现**：

- 使用预处理语句（prepared statement）插入数据库
- 自动记录当前会话 ID（`config.configurable.thread_id`）
- 创建成功后调用 `invalidateMemoryCache()` 清空预加载缓存，确保下一轮对话能看到新记忆

### 2. `memory_retrieve` — 检索记忆

```typescript
// memory_retrieve_tool.ts
memoryRetrieveTool({
  query: string[],   // 关键词数组
  limit?: number     // 返回数量，1-50，默认 10
})
```

**参数校验**：

- `query` 不能为空数组
- `limit` 必须在 1-50 范围内

**实现**：

- 调用 `searchMemories` 执行多因子加权检索
- 返回 JSON 字符串格式的结果数组

### 3. `memory_delete` — 删除记忆

```typescript
// memory_delete_tool.ts
memoryDeleteTool({
  id: number, // 记忆 ID
});
```

**参数校验**：

- `id` 必须是正整数
- 删除前会先检查该 ID 是否存在

**实现**：

- 删除成功后调用 `invalidateMemoryCache()` 清空预加载缓存，确保下一轮对话不再包含已删除的记忆

## 预加载层：自动注入最近记忆

除了 LLM 主动调用 `memory_retrieve` 进行**按需检索**外，系统还在每轮对话的系统提示词中**自动预加载**最近的记忆，让 LLM 无需主动检索就能感知到用户的历史信息。

### 实现机制

核心在 [`prompt.ts:92-130`](../src/agent/prompt.ts#L92-L130)：

```typescript
// 模块级缓存，避免每轮对话都查数据库
let cachedMemories: ReturnType<typeof listRecentMemories> | null = null;

// 清空缓存（在记忆创建/删除后调用）
export function invalidateMemoryCache(): void {
  cachedMemories = null;
}

// 动态构建系统提示词
export function buildSystemPrompt(): string {
  if (!cachedMemories) {
    cachedMemories = listRecentMemories(10); // 取最近 10 条
  }
  const memorySection =
    cachedMemories.length > 0
      ? `## Recent Memories\n\n${cachedMemories.map((m) => `- ${m.content}`).join("\n")}`
      : "";
  // ... 拼接 basePrompt, profilePrompt, memorySection, memoryPrompt ...
}
```

### 工作流程

1. **每轮对话**：`agent.ts` 的 `modelRequest` 节点调用 `buildSystemPrompt()` 构建系统提示词
2. **缓存命中**：若 `cachedMemories` 已有值，直接使用，不查数据库
3. **缓存未命中**：调用 `listRecentMemories(10)` 从数据库取最近 10 条记忆，缓存到内存
4. **格式化为** `## Recent Memories` 段落，以 `- {content}` 列表形式注入系统提示词
5. **缓存失效**：`memory_create` 或 `memory_delete` 成功后调用 `invalidateMemoryCache()`，下一轮对话重新加载

### 为什么需要缓存？

| 场景         | 不缓存的问题                 | 缓存的好处                             |
| ------------ | ---------------------------- | -------------------------------------- |
| 多轮连续对话 | 每轮都查一次数据库，I/O 开销 | 只在首次或变更后查一次                 |
| 记忆未变更   | 重复查询相同数据             | 直接复用内存结果                       |
| 记忆变更后   | 可能读到旧数据               | `invalidateMemoryCache()` 强制重新加载 |

### 预加载 vs 主动检索

| 维度     | 预加载（`listRecentMemories`） | 主动检索（`memory_retrieve`） |
| -------- | ------------------------------ | ----------------------------- |
| 触发方式 | 自动，每轮对话                 | LLM 主动调用工具              |
| 查询方式 | 按时间倒序取最近 N 条          | 按关键词全文搜索              |
| 排序     | `updated_at DESC`              | 三因子加权评分                |
| 数量     | 固定 10 条                     | 可配置 limit（1-50）          |
| 适用场景 | 让 LLM 对用户有整体感知        | 针对具体问题精准查找          |

两者互补：预加载提供"背景知识"，主动检索提供"精准答案"。

## 提示词层：LLM 行为指导

在 [`prompt.ts:45-49`](../src/agent/prompt.ts#L45-L49) 中定义了记忆管理规则：

```markdown
## Memory Management Rules

- When deleting a memory, first use memory_retrieve to find its id,
  then call memory_delete with that id.
- When updating a memory, first delete the old memory, then create a new one.
- When information fits the categories in <profile_template>, do not record
  it as a memory. It will be stored in the profile file instead.
```

关键规则：

1. **删除前必须先检索**：获取准确的记忆 ID，避免误删
2. **更新 = 删除 + 创建**：保持简单，避免复杂的 UPDATE 逻辑
3. **Profile 与 Memory 分离**：用户基本信息（姓名、职业等）存储在 profile，不存入记忆

## 使用场景示例

| 场景                   | 操作                                             |
| ---------------------- | ------------------------------------------------ |
| 用户说"我喜欢喝咖啡"   | `memory_create` (type: `preference`)             |
| 用户问"我喜欢喝什么？" | `memory_retrieve` (query: `["喜欢", "喝"]`)      |
| 用户说"我不喝咖啡了"   | 先 `memory_retrieve` 找到 ID，再 `memory_delete` |
| 用户说"我上周去了北京" | `memory_create` (type: `event`)                  |
| 用户问"我会什么技能？" | `memory_retrieve` (query: `["技能"]`)            |

## 设计特点

| 特点           | 说明                                               |
| -------------- | -------------------------------------------------- |
| **全文搜索**   | 基于 SQLite FTS5，支持高效的中文/英文全文检索      |
| **多因子排序** | 相关性 + 重要性 + 时效性，确保最相关的记忆排在前面 |
| **自动预加载** | 每轮对话自动注入最近 10 条记忆，LLM 无需主动检索   |
| **缓存优化**   | 模块级缓存避免重复查库，创建/删除后自动失效        |
| **自动同步**   | 触发器自动维护 FTS 索引，无需手动干预              |
| **会话隔离**   | 每条记忆关联 `session_id`，可追溯来源              |
| **轻量级**     | 纯 SQLite 实现，无需额外依赖                       |

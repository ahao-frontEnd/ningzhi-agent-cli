import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { formatRelativeTime, truncate } from "./utils";

export const DB_PATH = join(process.cwd(), ".dbData", "checkpointer.db");

// recursive 多层路径创建，且目录已存在不报错，幂等性
mkdirSync(dirname(DB_PATH), { recursive: true });

// 会话行
export interface SessionRow {
  thread_id: string;
  last_question: string;
  last_ts: string;
}

// 记忆搜索结果
export interface MemorySearchResult {
  id: number;
  type: string;
  content: string;
  keywords: string | null;
  importance: number;
  session_id: string | null;
  created_at: string;
  updated_at: string;
  final_score: number;
}

// 搜索记忆
export function searchMemories(
  query: string[],
  limit = 10,
): MemorySearchResult[] {
  const trimmedQueries = query.map((q) => q.trim()).filter((q) => q.length > 0);
  if (trimmedQueries.length === 0) {
    return [];
  }
  const queryStr = trimmedQueries.join(" OR ").replace(/-/g, " ");

  const db = new Database(DB_PATH);
  try {
    const rows = db
      .prepare(
        `
      WITH ranked AS (
        SELECT
          m.*,
          -bm25(memory_fts, 10.0, 5.0) AS relevance_score,
          (m.importance * 0.3) AS importance_score,
          (
            1.0 / (
              1.0 +
              ((strftime('%s','now') - strftime('%s', m.updated_at)) / 86400.0)
            )
          ) AS time_score
        FROM memory_fts
        JOIN memory m ON m.id = memory_fts.rowid
        WHERE memory_fts MATCH ?
      )
      SELECT *,
        (
          relevance_score * 0.6 +
          importance_score * 0.3 +
          time_score * 0.1
        ) AS final_score
      FROM ranked
      ORDER BY final_score DESC
      LIMIT ?
    `,
      )
      .all(queryStr, limit) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: r.id as number,
      type: r.type as string,
      content: r.content as string,
      keywords: r.keywords as string | null,
      importance: r.importance as number,
      session_id: r.session_id as string | null,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
      final_score: r.final_score as number,
    }));
  } finally {
    db.close();
  }
}

// 检查会话id是否存在
export function threadIdExists(threadId: string): boolean {
  const db = new Database(DB_PATH);
  try {
    const row = db
      .prepare(
        `
      SELECT 1 FROM checkpoints WHERE thread_id = ? LIMIT 1
    `,
      )
      .get(threadId);
    return !!row;
  } finally {
    db.close();
  }
}

// 初始化数据库
export function initDb(): void {
  const db = new Database(DB_PATH);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        keywords TEXT, 
        importance INTEGER DEFAULT 3,
        session_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // SQLite 的 FTS（Full-Text Search）模块是一种虚拟表模块，支持高效的全文搜索功能。
    // FTS5 是 SQLite 最新的全文搜索引擎，提供了强大的功能和灵活性。
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        content,
        keywords,
        content='memory', content_rowid='id'
      )
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS memory_fts_insert AFTER INSERT ON memory BEGIN
        INSERT INTO memory_fts(rowid, content, keywords)
        VALUES (new.id, new.content, new.keywords);
      END;

      CREATE TRIGGER IF NOT EXISTS memory_fts_delete AFTER DELETE ON memory BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, content, keywords)
        VALUES ('delete', old.id, old.content, old.keywords);
      END;

      CREATE TRIGGER IF NOT EXISTS memory_fts_update AFTER UPDATE ON memory BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, content, keywords)
        VALUES ('delete', old.id, old.content, old.keywords);
        INSERT INTO memory_fts(rowid, content, keywords)
        VALUES (new.id, new.content, new.keywords);
      END;
    `);

    // ========== 全量补索引 ==========
    // 触发器只对"创建之后"的 INSERT 生效，
    // 之前已存在的 memory 数据不会自动进入 memory_fts，导致 MATCH 返回空。
    // 这里把 memory 中尚未在 memory_fts 建立索引的条目一次性回填。
    db.exec(`
      INSERT INTO memory_fts(rowid, content, keywords)
      SELECT m.id, m.content, m.keywords
      FROM memory m
      WHERE NOT EXISTS (
        SELECT 1 FROM memory_fts f WHERE f.rowid = m.id
      );
    `);
  } finally {
    db.close();
  }
}

/**
 * 列出最近 20 个会话（线程）
 * @returns 会话列表
 */
export function listRecentSessions(): SessionRow[] {
  const db = new Database(DB_PATH);
  try {
    // 查询最近 20 个会话（线程）：取每个线程的最后活跃时间，以及最近一条用户提问
    const rows = db
      .prepare(
        `
      -- CTE：取每个线程最新的 checkpoint 及其 ts
      WITH thread_last AS (
        SELECT
          thread_id,
          MAX(json_extract(CAST(checkpoint AS TEXT), '$.ts')) AS last_ts,
          (SELECT CAST(c2.checkpoint AS TEXT)
           FROM checkpoints c2
           WHERE c2.thread_id = c.thread_id
           ORDER BY json_extract(CAST(c2.checkpoint AS TEXT), '$.ts') DESC
           LIMIT 1) AS last_checkpoint
        FROM checkpoints c
        GROUP BY thread_id
      )
      SELECT
        t.thread_id,
        -- 从最新 checkpoint 的 messages 数组中，取最后一条用户消息的内容
        (SELECT COALESCE(
                  json_extract(j.value, '$.kwargs.content'),
                  json_extract(j.value, '$.content')
                )
         FROM json_each(json_extract(t.last_checkpoint, '$.channel_values.messages')) j
         WHERE json_extract(j.value, '$.id[2]') = 'HumanMessage'
            OR json_extract(j.value, '$.type') = 'human'
         ORDER BY CAST(j.key AS INTEGER) DESC
         LIMIT 1) AS last_question,
        t.last_ts
      FROM thread_last t
      ORDER BY t.last_ts DESC  -- 按最后活跃时间倒序（最新的在前）
      LIMIT 20                 -- 只取最近 20 个会话
    `,
      )
      .all() as Array<{
      thread_id: string;
      last_question: string | null;
      last_ts: string;
    }>;

    return rows.map((r) => ({
      thread_id: r.thread_id,
      last_question: truncate(r.last_question, 50),
      last_ts: formatRelativeTime(r.last_ts),
    }));
  } finally {
    db.close();
  }
}

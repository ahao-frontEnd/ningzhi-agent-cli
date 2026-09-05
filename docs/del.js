import Database from "better-sqlite3";
import { join } from "node:path";

const DB_PATH = join(process.cwd(), ".dbData", "checkpointer.db");
const db = new Database(DB_PATH);

// 0. 操作前完整性基线
console.log("integrity_check(前):", JSON.stringify(db.pragma("integrity_check")));

// 1. 全量重建 FTS 索引（从 memory 内容表重灌，修复缺失/重复条目）
db.exec("INSERT INTO memory_fts(memory_fts) VALUES('rebuild');");
console.log("FTS 索引已重建");

// 2. 重建后再验证完整性
console.log("integrity_check(后):", JSON.stringify(db.pragma("integrity_check")));

// 3. 删除 id 最小的两行（此时触发器可正常同步索引）
const info = db
  .prepare("DELETE FROM memory WHERE id IN (SELECT id FROM memory ORDER BY id ASC LIMIT 2)")
  .run();
console.log(`已删除 ${info.changes} 行`);

// 4. 验证：剩余行数 + FTS 中不应再有 id 1/2
console.log("剩余记录数:", db.prepare("SELECT COUNT(*) AS c FROM memory").get());
console.log("FTS 中 id 1/2 残留:", db.prepare("SELECT rowid FROM memory_fts WHERE rowid IN (1,2)").all());

db.close();


/*
根因分析
看证据链：

预览 SELECT 成功了 —— 读的是 memory 普通表，说明 db 文件主体没坏；

DELETE 才炸 —— 删除时触发了 db.ts:L140-143 的 memory_fts_delete 触发器，它执行 FTS5 的 'delete' 命令；
FTS5 的 'delete' 命令有一个硬性要求：索引里必须存在与被删行完全一致的词条，否则直接报 database disk image is malformed。

而 id=1（水蜜桃）、id=2（兔子）正是早期在触发器生效前插入的那批数据——如果之前加的补索引 SQL 没有实际跑过（比如改完 initDb() 后没重启应用），
memory_fts 里根本没有这两行的索引。于是“删索引里不存在的行”就报了 SQLITE_CORRUPT_VTAB。


修复方案：先 rebuild 再删
FTS5 提供了一个官方恢复命令 'rebuild'——把整个索引清掉后从 memory 表全量重灌，一次性修复“缺失”和“重复”两类不一致。索引一致了，触发器就能正常同步。


两点说明
'rebuild' 为什么安全：外部内容表（content='memory'）的索引本来就是“派生物”，从内容表全量重建只是恢复它应有的状态，不会丢 memory 表数据。
之后要让补索引真正生效：跑完后重启一次应用让 initDb() 执行——现在 FTS 索引已一致，initDb() 里的 NOT EXISTS 补索引逻辑也不会再产生重复条目。
如果第 0 步的 integrity_check 就报 malformed（而不是 ok），说明问题超出 FTS 范围，把完整输出贴给我，再走从 .bak 恢复的路径。

*/
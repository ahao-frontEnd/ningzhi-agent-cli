import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

import { WORKSPACE_DIR, CONFIG_PATH } from "./agent/config";
import { initDb } from "./agent/db";

// 工作空间第三方 skills 目录
const SKILLS_DIR = path.join(WORKSPACE_DIR, ".agents", "skills");

// 同步执行 shell 命令；stdio: "inherit" 让子进程继承父进程的输入输出流，输出实时打印到终端
function run(command: string, options?: { timeout?: number }): void {
  // `execSync` 启动子进程，"inherit" —— 共享父进程的输入输出流，输出实时打印到终端
  // `stdio` 选项就是控制“子进程的输入输出接到哪里”
  execSync(command, { stdio: "inherit", ...options });
}

// 从 GitHub 仓库下载并安装单个 skill 到本地目标目录
function installSkill(
  name: string, // skill 名称
  repo: string, // GitHub 仓库，如 "vercel-labs/skills"
  skillPath: string, // 仓库内 skill 所在的子路径
  targetDir: string, // 工作空间安装的第三方skill目录
  tempDir: string, // 临时目录（用于下载和解压）
): void {
  // 已存在则跳过，避免重复安装
  if (fs.existsSync(targetDir)) {
    console.log(`  ✅ ${name} 已存在，跳过`);
    return;
  }

  console.log(`  📥 正在下载 ${name}...`);
  const tarPath = path.join(tempDir, `${name}.tar.gz`);
  const extractDir = path.join(tempDir, `${name}-extract`);
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    // 下载仓库 main 分支的 tar.gz 压缩包
    run(
      `curl -fsSL -o "${tarPath}" "https://github.com/${repo}/archive/refs/heads/main.tar.gz"`,
      { timeout: 30000 },
    );
    // 解压到临时目录
    run(`tar -xzf "${tarPath}" -C "${extractDir}"`, { timeout: 20000 });
    // 压缩包 解压后 顶层目录名 带哈希后缀（如 repo-main），取第一个即实际根目录
    const subDir = fs.readdirSync(extractDir)[0];
    // 把仓库内的 skill 子目录递归拷贝到目标目录
    fs.cpSync(path.join(extractDir, subDir, skillPath), targetDir, {
      recursive: true,
    });
    console.log(`  ✅ ${name} 安装完成`);
  } catch (error: any) {
    // 超时（execSync 被 kill，可能表现为 killed 或 ETIMEDOUT）或网络不通等
    // 一律不阻断初始化，提示后继续；下次运行会因目录不存在而自动重试安装
    const timedOut = error?.killed || error?.code === "ETIMEDOUT";
    console.log(
      timedOut
        ? `  ⏱️  ${name} 下载/安装超时，已跳过`
        : `  ⚠️  ${name} 安装失败（${error?.code ?? error?.message ?? "未知错误"}），已跳过`,
    );
    return;
  }
}

// 首次运行初始化：建库、装默认 skills、生成配置模板
export async function runInstall(): Promise<void> {
  console.log("🚀 欢迎使用 NingzhiAgentCli！首次使用需要进行初始化配置。\n");

  // 1. 初始化数据库
  console.log("📦 正在初始化数据库...");
  initDb();
  console.log("✅ 数据库初始化完成\n");

  // 2. 安装 skills
  console.log("🔧 正在安装默认 skills...");
  fs.mkdirSync(SKILLS_DIR, { recursive: true });

  // 创建系统临时目录，安装结束后在 finally 中清理
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ningzhi-"));

  try {
    installSkill(
      "find-skills", // 要安装的skill名称
      "vercel-labs/skills", // github仓库名称
      "skills/find-skills", // 仓库内 skill 所在的子路径
      path.join(SKILLS_DIR, "find-skills"),
      tempDir,
    );
    // 容易安装失败，===》 内置到 agent 中，优化 首次安装的使用体验
    // installSkill(
    //   "skill-creator",
    //   "anthropics/skills",
    //   "skills/skill-creator",
    //   path.join(SKILLS_DIR, "skill-creator"),
    //   tempDir,
    // );
  } finally {
    // Windows 下刚写入的文件可能被杀毒软件/索引服务短暂锁定（EBUSY），
    // maxRetries 让 Node 内置重试；清理失败不应中断主流程，故仅提示
    try {
      fs.rmSync(tempDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    } catch {
      console.log(`  ⚠️ 临时目录清理失败（可稍后手动删除）: ${tempDir}`);
    }
  }

  console.log("✅ Skills 安装完成\n");

  // 3. 创建配置文件（写入占位符，待用户填入真实密钥）
  console.log("⚙️  正在创建配置文件...");
  const configTemplate = {
    model: {
      model: "kimi-k2.6",
      apiKey: "your-api-key",
      baseURL: "https://api.moonshot.cn/v1",
    },
    env: {
      TAVILY_API_KEY: "your-tavily-api-key",
    },
  };

  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(
    CONFIG_PATH,
    JSON.stringify(configTemplate, null, 2),
    "utf-8",
  );
  console.log(`✅ 配置文件已创建: ${CONFIG_PATH}\n`);

  // 4. 提示用户
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 初始化完成！");
  console.log("");
  console.log("⚠️  请编辑配置文件，填入你的 API 密钥：");
  console.log(`   ${CONFIG_PATH}`);
  console.log("");
  console.log(
    "📖 配置文档: https://www.npmjs.com/package/ningzhi-agent-cli?activeTab=readme",
  );
  console.log("");
  console.log("🔄 修改完成后，请重新运行 ningzhi");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

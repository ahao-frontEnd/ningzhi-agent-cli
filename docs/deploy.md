# 发布到 npm

本文档记录 `ningzhi-agent-cli` 发布到 npm registry 的完整流程，以及发布过程中遇到的坑。

## 前置条件

- npm 账号（本项目发布账号：`ningzhi2`），已开启 2FA
- 账号上有一个 **bypass-2FA 的 Granular Access Token**（见下文「认证配置」）
- 本地 Node.js >= 22

## 发布步骤

### 1. 更新版本号

修改 [package.json](../package.json) 中的 `version` 字段（遵循语义化版本）：

```json
"version": "0.1.0"
```

> 同一版本号在 npm 上只能发布一次，不能覆盖。

### 2. 重新构建

发布的是 `dist/` 编译产物，**改了 `src/` 必须重新构建**，否则发布的是旧代码：

```bash
pnpm build
```

### 3. 预检打包内容（可选）

模拟发布，确认打包文件清单是否符合预期（受 [.npmignore](../.npmignore) 控制）：

```bash
npm pack --dry-run
```

注意：npm 硬性规则始终排除 `.npmrc`，无需在 `.npmignore` 中配置。

### 4. 发布

当前使用的认证方式是 **bypass-2FA 令牌**，直接发布即可，**不需要带 `--otp`**：

```bash
npm publish
```

成功后可在 https://www.npmjs.com/package/ningzhi-agent-cli 查看。

## 认证配置（重点）

npm 的令牌体系已于 2025 年 11 月换代，**经典令牌（Legacy Token）已被彻底移除**，`npm login` 现在签发的都是 `npm_` 开头的 Granular Access Token。而账号开启 2FA 后，发布要求二选一：

1. 交互式 2FA 验证（OTP）
2. 使用开启 **bypass-2FA** 的 Granular Access Token

### 当前方案：bypass-2FA 令牌

1. 登录 https://www.npmjs.com/settings/ningzhi2/tokens
2. **Generate New Token → Granular Access Token**
3. 配置：
   - Packages and scopes：**Read and write**
   - 包范围：选择 `ningzhi-agent-cli`（新包未发布时选 **All packages**）
   - 勾选 **Allow this token to bypass two-factor authentication**
   - 过期时间按需（如 30 天）
4. 复制生成的令牌（**只显示一次**），写入本地配置（在 PowerShell 中执行，不要用 Git Bash，它可能改写开头的 `//`）：

```powershell
npm config set "//registry.npmjs.org/:_authToken=npm_粘贴你的新令牌"
npm whoami   # 验证，应显示 ningzhi2
```

5. 之后直接 `npm publish`，不要加 `--otp`。

### 令牌管理

```powershell
npm token list            # 查看所有令牌（只显示掩码，无法找回明文）
npm token revoke <id>     # 吊销令牌
```

- 令牌的完整明文只在创建时显示一次，丢失只能吊销重建
- 旧令牌不再使用时建议及时吊销，降低泄露风险

### 政策时间线（2026-07 公告）

| 时间           | 政策                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------ |
| 2025-11        | 经典令牌移除，只签发 Granular Token                                                        |
| 2026-08        | bypass-2FA 令牌不能再跳过 2FA 做账号/包管理操作                                            |
| **约 2027-01** | **bypass 令牌不能再直接 publish**，需迁移到 Trusted Publishing (OIDC) 或 Staged Publishing |

届时如需 CI 自动发布，参考：

- Trusted Publishing：https://docs.npmjs.com/trusted-publishers
- Staged Publishing：https://docs.npmjs.com/staged-publishing

## 已踩过的坑

### 1. EBUSY: resource busy or locked（Windows 首次运行初始化）

`install.ts` 中 `fs.rmSync` 清理临时目录时，Windows 杀毒软件实时扫描会短暂锁定刚下载的文件，导致删除失败崩溃。已修复：

```typescript
fs.rmSync(tempDir, {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 200,
});
```

且清理逻辑用 try/catch 包裹——`finally` 中的"尽力而为"清理不应抛错，否则会覆盖真正的错误。

### 2. ETIMEDOUT: GitHub 下载超时

初始化时从 GitHub 下载 skills（`curl ... github.com`）在国内网络环境下经常超时。处理建议：

```powershell
# 挂代理后再运行
$env:HTTPS_PROXY="http://127.0.0.1:7890"
ningzhi
```

安装失败现在只警告不中断，下次运行会自动补装缺失的 skill（已存在的会跳过）。

### 3. E403: Two-factor authentication required（发布被拒）

现象：`npm publish --otp=xxxxxx` 仍然 403，且调试日志里只有**一次 PUT 请求**就退出。

根因链：

1. 当前 token 是 `npm_` 开头的 Granular Token，`--otp` 对其无效
2. npm 的 OTP 重试逻辑只在服务端回 **401 质询**时才触发；granular token 直接收到 **403**，`--otp` 被忽略
3. 该 token 创建时未勾选 bypass-2FA

解决：按上文「认证配置」创建 bypass-2FA 的 Granular Token，发布时**不带 `--otp`**。

> 判断依据：token 前缀为 `npm_`、长度 40 即 Granular Token。OTP 输错会报 401 Invalid OTP，报 403 说明是 token 权限问题而非验证码问题。

### 4. E400: 包名含大写字母

npm 对新发布的包强制小写命名（只允许小写字母、数字、连字符）。`ningzhiAgentCli` 会被拒，已改为 `ningzhi-agent-cli`。发布前先到 https://www.npmjs.com/package/包名 确认未被占用。

### 5. 改了 src 忘记重新 build

`npm publish` 发布的是 `dist/`，错误栈中路径显示 `dist/xxx.js` 时，先确认 dist 是否为最新构建产物。

## 发布检查清单

- [ ] `package.json` 的 `version` 已递增
- [ ] `pnpm build` 已执行，dist 为最新
- [ ] `npm pack --dry-run` 确认打包内容（可选）
- [ ] `~/.npmrc` 中的 token 为有效的 bypass-2FA Granular Token
- [ ] `npm publish`（不带 `--otp`）
- [ ] 发布后到 npmjs.com 验证，并用 `npm i ningzhi-agent-cli -g` 实测安装

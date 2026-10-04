# CLI 交互中"偶发需要多按回车才能输入"问题复盘

## 问题现象

在 `ningzhi-cli` 的交互式对话中，有时会出现：

- AI 回复结束后，提示符（`userPrefix`）正常显示，但键盘输入无响应；
- 需要再按一两次回车键才能恢复正常输入；
- 偶发出现，无稳定复现路径。

问题定位在主循环的输入行（`src/agent/cli.ts`）：

```typescript
const userInput = await prompt(color.userPrefix());
```

## 涉及的核心机制

要理解这个问题，需要先搞清楚 Node.js `readline` 与 `process.stdin` 的几个关键行为：

### 1. readline 接口与 stdin 的关系

`readline.createInterface({ input: process.stdin, output: process.stdout })` 会在 `process.stdin` 上注册一个 `data` 事件监听器，用来读取用户输入的每一行。

### 2. rl.close() 的副作用

`rl.close()` 会：

- 从 `process.stdin` 上移除 readline 注册的内部 `data` 监听器；
- 把接口标记为 `closed`；
- 在**所有**消费者移除后，`process.stdin` 可能自动退回 **paused** 模式。

### 3. readline.emitKeypressEvents() 的副作用

```typescript
readline.emitKeypressEvents(process.stdin);
```

这个函数会向 `process.stdin` 注入一个 `data` 监听器，把原始字节流解析成 `keypress` 事件。这个监听器**不会**随 `removeListener("keypress", ...)` 被清理——因为它是 `data` 监听器，不是 `keypress` 监听器。

### 4. rl.question() 内部的 pause

`rl.question()` 在回调触发后，内部会调用 `this.pause()`，把 stdin 切回暂停模式。这是 readline 的默认行为，目的是在不需要输入时节省资源，但也给后续的状态恢复带来了麻烦。

## 根因分析

原始代码的关键流程：

```typescript
// prompt() 每轮新建接口
function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface();      // ← 新建接口
    rl.question(question, (answer) => {
      rl.close();                      // ← 用完即关
      resolve(answer);
    });
  });
}

// chat() 又新建接口
async function chat(userInput: string): Promise<void> {
  const rl = createInterface();        // ← 新建接口
  readline.emitKeypressEvents(process.stdin);
  process.stdin.on("keypress", escListener);
  // ... AI 请求 ...
  finally {
    process.stdin.removeListener("keypress", escListener);
    rl.close();                        // ← 用完即关
  }
  rl.resume();                         // ← 对已关闭接口 resume
}
```

### 问题链条

1. **反复 create/close 导致 stdin 监听器集合频繁变化**
   - `prompt()` 创建 → 关闭：stdin 上从 0 个 data 监听器变成 1 个（emitKeypressEvents 的残留）再变 0 个；
   - `chat()` 创建 → 关闭：stdin 上监听器数量在 1↔2 之间跳变；
   - 监听器集合的频繁变化，使得 `process.stdin` 在 flowing / paused 状态间反复切换。

2. **`rl.resume()` 对已关闭接口不可靠**
   - `rl.close()` 已经把接口销毁，它与 stdin 的内部绑定被切断；
   - 对已关闭接口调用 `resume()`，虽然 Node.js 源码不检查 `closed` 标志，会尝试调 `input.resume()`，但在 **Windows 控制台**的某些时序下并不可靠；
   - 结果：stdin 仍可能停留在 paused 模式，下一轮 `prompt()` 的新接口读不到数据。

3. **`rl.question()` 内部的 pause 进一步加剧问题**
   - question 回调触发后，readline 内部会 `rl.pause()`；
   - 后续 `process.stdin.resume()` 与这个内部 pause 之间存在时序竞争；
   - 在 Windows 下，这种竞争偶尔导致 stdin 没有真正恢复流动。

4. **AI 生成期间的按键残留**
   - 为了让 ESC 键可用，`process.stdin` 在 AI 生成期间是 flowing 的；
   - 用户在等待回复时误按的键会被 readline 累积到行缓冲区；
   - 下一轮 `rl.question()` 会立即返回这些残留内容，表现为"刚出提示符就自动提交了"。

## 修复演进

### 第一次尝试（治标，未解决）

仅把 `chat()` 末尾的 `rl.resume()` 改为 `process.stdin.resume()`，并在 `prompt()` 开头加一行 `process.stdin.resume()`。

**未解决的原因：** 核心矛盾——反复 create/close 导致的 stdin 状态抖动——没有消除。`resume()` 只是试图在状态错乱后强行拉回 flowing，但监听器集合的频繁变化仍然存在。

### 第二次尝试（治本，解决）

采用**单一全局 readline 接口**方案，从架构上消除状态抖动：

```typescript
// 全局复用的接口，不再每轮 create/close
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
readline.emitKeypressEvents(process.stdin);  // 只初始化一次
```

配合以下调整：

1. **`prompt()` 前清空残留输入行**
   ```typescript
   rl.write(null, { ctrl: true, name: "u" });  // 模拟 Ctrl+U，清空当前行
   ```
   避免 AI 生成期间误按的键被自动提交。

2. **`chat()` 中主动 resume stdin**
   ```typescript
   process.stdin.on("keypress", escListener);
   process.stdin.resume();  // 抵消 rl.question 内部的 pause，保证 ESC 可用
   ```

3. **移除 `chat()` 中的 `rl.close()`**
   全局接口只在主循环退出（`exit` 命令）时统一关闭。

### 修复后的效果

- `process.stdin` 上始终只有两个稳定的 `data` 监听器（emitKeypressEvents 的 + readline 的），数量不再跳变；
- stdin 的 flowing/paused 状态由单一接口管理，不再存在多个接口之间的状态竞争；
- 残留输入行被清空，不会出现"自动提交"现象。

## 关键经验总结

| 经验点 | 说明 |
|--------|------|
| **避免反复 create/close readline 接口** | 每轮都 create + close 会导致 stdin 监听器集合频繁变化，在 Windows 下极易引发输入失效。应复用单一接口。 |
| **`rl.close()` 后不要调用 `rl.resume()`** | 接口已销毁，resume 操作不可靠。应直接操作 `process.stdin.resume()`。 |
| **`rl.question()` 内部会 pause stdin** | 如果后续需要 stdin 保持流动（如监听 keypress），必须主动 `process.stdin.resume()`。 |
| **emitKeypressEvents 的监听器不会被 removeListener 清理** | 它注册的是 `data` 监听器，`removeListener("keypress", ...)` 只能移除用户自己的 keypress 监听。 |
| **AI 生成期间的按键会被累积** | stdin 处于 flowing 模式时，用户按键会进入 readline 行缓冲区，下一轮 question 会返回这些残留。需要在 prompt 前清空。 |
| **Windows 控制台对时序更敏感** | 同样的代码在 macOS/Linux 下可能正常，Windows 下更容易出现 stdin 状态恢复失败的问题。 |

## 参考代码

修复后的核心结构见 `src/agent/cli.ts`：

- 全局 `rl` 接口定义
- `prompt()` 函数（含 Ctrl+U 清空）
- `chat()` 函数（含 stdin.resume 和移除 close）
- `interactiveChat()` 主循环（exit 时关闭全局接口）

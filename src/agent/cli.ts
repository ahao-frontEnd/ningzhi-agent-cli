import * as readline from 'readline'
import { runAgentStream } from './agent'

// 历史记录由 agent.js 的 checkpointer 自动持久化，这里只需固定 thread_id
const THREAD_ID = 'user-session-1'

// 创建 readline 接口实例，用于从终端读取用户输入
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})


/* 
  rl.question(query, callback) 是 Node.js readline 模块里 Interface 的方法，用来向终端输出提示并等待用户输入。
    query：要显示的提示文本（string）。
    callback：用户输入完成（按回车）后调用的函数
*/
function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}


/* 
  readline.Interface 提供的控制输入流的方法；
  pause() 暂停对 stdin 的监听，
  resume() 恢复监听
*/
async function chat(userInput: string): Promise<void> {
  rl.pause() // 暂停 readline，避免光标错位

  process.stdout.write('\nAI: ')

  await runAgentStream(
    userInput,
    (token: string) => {
      process.stdout.write(token)
    },
    THREAD_ID,
  )

  process.stdout.write('\n\n')
  rl.resume() // 恢复 readline
}

/* 
  主函数，负责启动聊天界面
 */
async function main(): Promise<void> {
  console.log('=== Agent 聊天控制台 (输入 "exit" 退出) ===\n')

  while (true) {
    const userInput = await prompt('You: ')

    if (!userInput.trim()) continue
    if (userInput.toLowerCase() === 'exit') {
      console.log('再见！')
      rl.close()
      break
    }

    try {
      await chat(userInput)
    } catch (err) {
      console.error('请求出错:', (err as Error).message)
    }
  }
}

main()

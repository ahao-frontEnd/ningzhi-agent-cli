import { createAgent, type ReactAgent } from 'langchain'
import { tool } from '@langchain/core/tools'
import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'
import * as dotenv from 'dotenv'

dotenv.config()

// ── 工具定义 ──────────────────────────────────────────────
const search = tool(
  async ({ query }) => {
    console.log(`\n[Tool] search called: "${query}"`)

    if (
      query.toLowerCase().includes('sf') ||
      query.toLowerCase().includes('san francisco')
    ) {
      return "It's 60 degrees and foggy."
    }
    return "It's 90 degrees and sunny."
  },
  {
    name: 'search',
    description: 'Call to surf the web.',
    schema: z.object({
      query: z.string().describe('The query to use in your search.'),
    }),
  },
)

// ── 模型 ──────────────────────────────────────────────────
const model = new ChatOpenAI({
  model: 'kimi-k2.6',
  apiKey: process.env.MOONSHOT_API_KEY,
  configuration: {
    baseURL: 'https://api.moonshot.cn/v1',
  },
  streaming: true,
})

// ── Agent 创建 ────────────────────────────────────────────
export const agent: ReactAgent = createAgent({
  model,
  tools: [search],
  systemPrompt: 'You are a helpful assistant.'
})

/**
 * 以流式方式运行 agent，将 token 逐个回调给调用方
 * @param {string} userMessage - 当前用户输入（历史已由 checkpointer 自动续接）
 * @param {Function} onToken   - 每个 token 到来时的回调 (token: string) => void
 * @param {string} threadId    - 会话 ID，相同 ID 自动续上历史记录
 * @returns {Promise<string>}  完整的 AI 回复文本
 */
export async function runAgentStream(
  userMessage: string,
  onToken: (token: string) => void,
  threadId: string = 'default-session',
): Promise<string> {
  const config = { configurable: { thread_id: threadId } }

  const stream = await agent.stream(
    { messages: [{ role: 'user', content: userMessage }] },
    { ...config, streamMode: 'messages' },
  )

  let fullResponse = ''

  for await (const chunk of stream as any) {
    const message = chunk[0]
    const metadata = chunk[1]

    if (metadata?.langgraph_node !== 'model_request') continue

    // AIMessageChunk 的 content 在 message.content 属性上，不在 kwargs.content
    const content: string = (message as any).content ?? (message as any).kwargs?.content ?? ''
    const toolCallChunks = (message as any).tool_call_chunks ?? []

    if (!content || toolCallChunks.length > 0) continue

    onToken(content)
    fullResponse += content
  }

  return fullResponse
}
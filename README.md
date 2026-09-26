# Ningzhi

A personal AI Agent like OpenClaw, including tools, skills, memory, hook, sub-agent, MCP sever, etc. Run in the terminal.

## tech

- runtime: nodejs
- language: typescript
- package tool: pnpm
- agent framework: langGraph
- LLM API: moonshot kimi
- CLI tool: commander.js

需要新建一个文件 `~/.ningzhi/ningzhi.json` 格式如下

```js
{
  "model": {
    "model": "qwen-plus", // 支持 kimi minimax glm xiaomi deepseek qwen ...
    "apiKey": "xxx",
    "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1"
  },
  "env": {
    "TAVILY_API_KEY": "xxx"
  }
}
```

## command

```bash
pnpm dev
pnpm test
pnpm build
```

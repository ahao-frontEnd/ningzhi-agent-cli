# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ningzhiAgentCli** — a personal AI Agent (inspired by OpenClaw) that runs in the terminal. Planned capabilities: tools, skills, memory, hooks, sub-agents, and MCP servers. Currently in early scaffolding (just a `greet` stub in `src/index.ts`).

## Tech Stack

- **Runtime**: Node.js (TypeScript, `target: ES2022`, `module: CommonJS`)
- **Package manager**: pnpm
- **Agent framework**: LangGraph (`@langchain/langgraph`, `langchain`, `@langchain/core`)
- **LLM provider**: Moonshot Kimi
- **CLI**: commander.js (planned)

## Common Commands

```bash
pnpm dev          # Run src/index.ts via ts-node
pnpm test         # Run all Jest tests once
pnpm test:watch   # Jest watch mode
pnpm test:coverage # Jest with coverage report (output: ./coverage/)
pnpm build        # Compile TypeScript to ./dist via tsc
pnpm clean        # Remove ./dist
```

**Run a single test file:**

```bash
pnpm test src/index.test.ts
```

**Run a single test by name pattern:**

```bash
pnpm test -t "should return a greeting"
```

Jest config lives in [jest.config.cjs](jest.config.cjs) (`ts-jest` preset, `**/*.test.ts` glob, Node test environment). TypeScript config is in [tsconfig.json](tsconfig.json); test files are excluded from `tsc` compilation.

## Code Architecture

The codebase is in early scaffolding — `src/` currently contains only [src/index.ts](src/index.ts) (a `greet` placeholder) and [src/index.test.ts](src/index.test.ts). The intended architecture, per the README, will add:

- **Tools / Skills** — discrete capabilities the agent can invoke.
- **Memory** — persistent context across sessions.
- **Hooks** — pre/post hooks around agent actions.
- **Sub-agents** — composed LangGraph graphs (the `@langchain/langgraph` dependency is the foundation).
- **MCP server** — Model Context Protocol server integration.

LangGraph dependency is already installed but no graph code exists yet. When implementing, keep the LangGraph state-graph wiring isolated under `src/` so it can grow without coupling to the CLI entry point.

## Conventions

- **Spelling**: The VSCode cSpell config at [.vscode/settings.json](.vscode/settings.json) whitelists project-specific terms (`ningzhi`, `kimi`, `langchain`, `langgraph`, etc.) — use these spellings.
- **Testing**: Tests are colocated as `*.test.ts` next to source files. Run `pnpm test:coverage` before opening a PR to keep `src/**/*.ts` covered.
- **Build output**: TypeScript compiles to `./dist/` (gitignored). The package entry points at `dist/index.js` with types at `dist/index.d.ts`.

## behavior rules

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

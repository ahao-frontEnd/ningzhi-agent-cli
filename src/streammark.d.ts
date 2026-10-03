declare module "streammark" {
  /**
   * 一次性渲染完整的 markdown 字符串，返回带 ANSI 样式的结果
   */
  export function render(
    markdown: string,
    opts?: { theme?: string | object },
  ): string;

  /**
   * 渲染并直接打印到 stdout
   */
  export function print(
    markdown: string,
    opts?: { theme?: string | object },
  ): void;

  /**
   * 流式 Markdown 渲染器 —— 为 LLM/agent 流式输出设计
   */
  export class MarkdownStream {
    constructor(opts?: {
      theme?: string | object;
      output?: NodeJS.WriteStream;
      newline?: boolean;
    });

    /** 推入文本块（可以是单个 token） */
    write(chunk: string): void;

    /** 结束流，刷新剩余缓冲内容 */
    end(): void;

    /** 便捷方法：管道一个文本块的异步可迭代对象 */
    pipe(readable: AsyncIterable<string>): Promise<void>;
  }

  export const themes: Record<string, object>;

  const _default: {
    render: typeof render;
    print: typeof print;
    MarkdownStream: typeof MarkdownStream;
  };
  export default _default;
}

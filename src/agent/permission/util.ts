import path from "node:path";

export function isInProjectDir(filepath: string): boolean {
  const resolved = path.resolve(filepath);
  const cwd = path.resolve(process.cwd());
  return resolved === cwd || resolved.startsWith(cwd + path.sep);
}

/*
    `(?:...)` 的`?:` 表示 非捕获组 ，只分组不保存匹配内容，
    比普通`()` 开销略小且不污染`match()` 结果，
    是纯布尔判断（`.test()` ）场景下的惯用写法。
*/
export function isChangingDirectory(command: string): boolean {
  return /(?:^|[\s;|&])(?:cd|chdir|pushd|popd)(?:\s|$)/i.test(command);
}

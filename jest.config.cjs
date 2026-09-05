const config = {
  preset: 'ts-jest', // 预设的作用是配置jest的默认行为，包括编译ts文件、使用ts-jest等。
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'], // 指定需要收集覆盖率的文件模式
  maxWorkers: 1, // 内存工具测试共用一个 SQLite 数据库文件，并行执行会在 afterEach 中互相删除 test-% 记录，改为串行执行以避免跨文件数据干扰
}

module.exports = config
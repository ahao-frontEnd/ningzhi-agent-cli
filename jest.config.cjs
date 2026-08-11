const config = {
  preset: 'ts-jest', // 预设的作用是配置jest的默认行为，包括编译ts文件、使用ts-jest等。
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'], // 指定需要收集覆盖率的文件模式
}

module.exports = config
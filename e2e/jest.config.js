// اختبارات شاملة ضد خدمات Supabase حقيقية تعمل محليًا (انظر e2e/run.sh).
// بيئة Node عادية (بدون محاكاة React Native) حتى يُستخدم fetch الحقيقي.
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/e2e/**/*.e2e.test.ts'],
  transform: { '\\.[jt]sx?$': ['babel-jest', { presets: [require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] })] }] },
  transformIgnorePatterns: ['/node_modules/(?!expo/virtual/)'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testTimeout: 30000,
};

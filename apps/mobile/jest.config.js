/** @type {import('jest').Config} */
module.exports = {
  // `react-native`'s own preset (not `jest-expo`: expo-modules-core is not
  // fully installed) supplies the native-module mocks that react-native's entry
  // point needs. Without it, requiring `StyleSheet` throws
  // "__fbBatchedBridgeConfig is not set, cannot invoke native modules", so no
  // test that renders a component can even load.
  preset: 'react-native',
  // Don't use jest-expo preset — expo-modules-core is not fully installed.
  // We configure transforms manually below.
  testEnvironment: 'node',
  collectCoverageFrom: [
    '**/*.{ts,tsx,js,jsx}',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/__mocks__/**',
    '!**/*.config.{js,ts}',
    '!coverage/**',
    '!**/.expo/**',
    '!path-alias.js',
  ],
  setupFiles: ['<rootDir>/__mocks__/jestSetup.js'],

  // babel emits `@babel/runtime/helpers/*` requires, and react-native's own
  // entry point requires them too, but nothing in this workspace declares
  // `@babel/runtime`. Node would still resolve it through pnpm's hidden
  // hoisted store; Jest's resolver walks only the visible `node_modules`
  // chain, so it has to be told where that store is.
  modulePaths: ['<rootDir>/../../node_modules/.pnpm/node_modules'],

  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      { configFile: require('path').resolve(__dirname, 'babel.config.js') },
    ],
  },

  // Transform expo/* packages since they ship ESM
  //
  // Under pnpm a package is not at `node_modules/<pkg>` but at
  // `node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>`. The old pattern
  // matched the first `node_modules/`, saw `.pnpm` (not allowlisted) and so
  // skipped the file, handing react-native's own Flow sources to Node
  // untransformed. The optional group below skips the `.pnpm` segment, and the
  // trailing `(@|/)` matches both `react-native/` and `react-native@0.83.6/`.
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?(expo|@expo|expo-notifications|expo-device|expo-constants|expo-secure-store|expo-modules-core|react-native|@react-native)(@|/))',
  ],

  // Manual mocks for native/expo modules
  moduleNameMapper: {
    '^@config/(.*)$': '<rootDir>/config/$1',
    '^@services/(.*)$': '<rootDir>/services/$1',
    '^@hooks/(.*)$': '<rootDir>/hooks/$1',
    '^@store/(.*)$': '<rootDir>/store/$1',
    '^@providers/(.*)$': '<rootDir>/providers/$1',
    '^@lib/(.*)$': '<rootDir>/../web/lib/$1',
    '^@utils/(.*)$': '<rootDir>/utils/$1',
    '^@components/(.*)$': '<rootDir>/components/$1',
    '^@hunty/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@hunty/types/(.*)$': '<rootDir>/../../packages/types/src/$1',
    '^@/(.*)$': '<rootDir>/$1',
    // Mock assets
    '\\.(png|jpg|jpeg|gif|svg|ico|webp|ttf|otf)$': '<rootDir>/__mocks__/fileMock.js',
  },

  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],

  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
  },
};

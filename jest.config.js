/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-nitro-fetch)/)',
  ],
  moduleNameMapper: {
    '^react-native-nitro-fetch$':
      '<rootDir>/src/__tests__/__mocks__/react-native-nitro-fetch.ts',
    '^react-native$': '<rootDir>/node_modules/react-native/index.js',
  },
  testEnvironment: 'node',
  globals: {
    __DEV__: true,
  },
  modulePathIgnorePatterns: [
    '<rootDir>/example/node_modules',
    '<rootDir>/lib/',
  ],
};

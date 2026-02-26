/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    matchers: ['<rootDir>/src/__tests__/**/*.test.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};

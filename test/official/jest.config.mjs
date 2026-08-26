export default {
  rootDir: "../..",
  testMatch: ["**/test/official/*-spec.js"],
  setupFilesAfterEnv: ["<rootDir>/test/official/setup.js"],
  snapshotSerializers: ["jest-serializer-html"],
  testEnvironment: "node",
  transform: {},
}

// Manual mock for @react-native-async-storage/async-storage.
//
// The `react-native` Jest preset makes Jest resolve this package's
// `AsyncStorage.native.ts`, which throws "[@RNC/AsyncStorage]: NativeModule:
// AsyncStorage is null" outside a real app. The package ships an official
// Jest mock for exactly this case, so re-export it here: because a `__mocks__`
// entry for a node_modules package is applied automatically, every suite that
// touches AsyncStorage benefits without editing the suites themselves.
module.exports = require('@react-native-async-storage/async-storage/jest/async-storage-mock');

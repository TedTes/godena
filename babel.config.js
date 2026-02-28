module.exports = function (api) {
  api.cache(true);

  let expoPreset;
  try {
    expoPreset = require.resolve('babel-preset-expo');
  } catch {
    // Fallback when preset is nested under expo's dependencies
    expoPreset = require.resolve('expo/node_modules/babel-preset-expo');
  }

  return {
    presets: [expoPreset],
  };
};

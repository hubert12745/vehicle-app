let plugins = [];
try {
  // only include reanimated plugin if package is installed
  require.resolve('react-native-reanimated/plugin');
  plugins.push('react-native-reanimated/plugin');
} catch (e) {
  // plugin not available — skip it
}

module.exports = {
  presets: ['babel-preset-expo'],
  plugins,
};

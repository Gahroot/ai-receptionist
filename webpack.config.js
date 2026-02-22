const { createExpoWebConfig } = require('@expo/webpack-config');

module.exports = async (env, argv) => {
  const config = await createExpoWebConfig({ ...env, ...argv });

  // Completely block @react-native/debugger-frontend on web
  config.resolve = config.resolve || {};
  config.resolve.alias = {
    ...config.resolve.alias,
    '@react-native/debugger-frontend': false,
    '@react-native/dev-middleware': false,
  };

  // Add it to externals as well
  config.externals = config.externals || [];
  if (Array.isArray(config.externals)) {
    config.externals.push({
      '@react-native/debugger-frontend': 'var {}',
      '@react-native/dev-middleware': 'var {}',
    });
  }

  // Ignore these modules in webpack
  config.ignoreWarnings = config.ignoreWarnings || [];
  config.ignoreWarnings.push(/@react-native\/debugger-frontend/);

  return config;
};

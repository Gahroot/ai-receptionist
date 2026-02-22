module.exports = function (api) {
  // Determine platform from Metro's caller info
  const platform = api.caller((caller) => caller?.platform);
  const isWeb = platform === 'web';
  process.env.TAMAGUI_TARGET = isWeb ? 'web' : 'native';

  // Re-evaluate config when platform changes
  api.cache.using(() => `platform:${isWeb ? 'web' : 'native'}`);

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'react',
          jsxRuntime: 'automatic',
          // Add lazy imports to avoid bundling issues
          lazyImportExport: true,
        },
      ],
    ],
    plugins: [
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './tamagui.config.ts',
          logTimings: true,
          // Disable extraction to avoid esbuild-register Node.js v22 issues
          disableExtraction: true,
          // Don't attempt to load config for static extraction
          disableAnyPass: true,
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};

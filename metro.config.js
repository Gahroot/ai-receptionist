const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Ensure proper handling of ES modules
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs'];

// Prefer CJS/main fields to avoid ESM packages using import.meta
// (import.meta is invalid in Metro's non-module <script> output)
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

// Force zustand to resolve to CJS on web (ESM version uses import.meta.env
// which is a SyntaxError in Metro's non-module <script> bundles)
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName.startsWith('zustand')) {
    // Rewrite ESM imports to CJS entry points
    const zustandRoot = path.dirname(require.resolve('zustand/package.json'));
    if (moduleName === 'zustand' || moduleName === 'zustand/esm/index.mjs') {
      return { type: 'sourceFile', filePath: path.join(zustandRoot, 'index.js') };
    }
    if (moduleName === 'zustand/middleware' || moduleName.includes('zustand/esm/middleware')) {
      return { type: 'sourceFile', filePath: path.join(zustandRoot, 'middleware.js') };
    }
    if (moduleName === 'zustand/react' || moduleName.includes('zustand/esm/react')) {
      return { type: 'sourceFile', filePath: path.join(zustandRoot, 'react.js') };
    }
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Blocklist problematic packages from being processed
config.resolver.blockList = [
  /esbuild-register/,
  /prettier/,
  /node_modules\/.+\/dist\/node\.js/,
];

// Don't use withTamagui wrapper - it causes extraction issues
// The babel-plugin handles Tamagui without the Metro wrapper

module.exports = config;

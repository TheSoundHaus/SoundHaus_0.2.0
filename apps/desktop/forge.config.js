const path = require('path');
const fs = require('fs');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: {
      unpack: '{**/node_modules/dugite/git/**,**/node_modules/semantic-differ/*.node}',
    },
    extraResource: ['.env'],
    name: 'SoundHaus',
    executableName: 'SoundHaus',
    icon: path.join(__dirname, 'assets/icons/icon'),
    ignore: [
      /\/native\/semantic-diff\/(target|src|\.cargo)(\/|$)/,
      /\/native\/semantic-diff\/(Cargo\.(toml|lock)|build\.rs)$/,
    ],
  },
  hooks: {
    packageAfterCopy: async (forgeConfig, buildPath) => {
      const symPath = path.join(buildPath, 'node_modules', 'semantic-differ');
      try {
        const stats = fs.lstatSync(symPath);
        if (stats.isSymbolicLink()) {
          const linkTarget = fs.readlinkSync(symPath);
          const resolved = path.resolve(path.dirname(symPath), linkTarget);
          fs.unlinkSync(symPath);
          fs.cpSync(resolved, symPath, { recursive: true });
        }
      } catch (err) {
        console.warn('Failed to dereference semantic-differ symlink:', err.message);
      }
      // native/ dir is no longer needed — module resolves via node_modules
      const nativeDir = path.join(buildPath, 'native');
      fs.rmSync(nativeDir, { recursive: true, force: true });
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'soundhaus',
        setupExe: 'SoundHaus Setup.exe',
        setupIcon: path.join(__dirname, 'assets/icons/icon.ico'),
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        icon: path.join(__dirname, 'assets/icons/icon.icns'),
        format: 'ULFO',
      },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          icon: path.join(__dirname, 'assets/icons/icon.png'),
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          icon: path.join(__dirname, 'assets/icons/icon.png'),
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

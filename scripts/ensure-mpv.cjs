const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const releaseDir = path.join(__dirname, '..', 'node_modules', 'electron-mpv-video', 'native', 'mpv-addon', 'build', 'Release');
const ready = fs.existsSync(path.join(releaseDir, 'mpv_addon.node')) &&
  fs.readdirSync(releaseDir).some(file => /^(libmpv-2|mpv-2)\.dll$/i.test(file));

if (!ready) {
  console.log('MyCinema: building its missing libmpv native player...');
  const result = spawnSync('npm', ['run', 'build:mpv'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

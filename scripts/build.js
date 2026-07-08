const esbuild = require('esbuild');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function build() {
  console.log('📦 Starting Pinterest Pin Publisher production build...');

  // Ensure clean dist directories
  const cleanDir = (dirPath) => {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
    fs.mkdirSync(dirPath, { recursive: true });
  };

  cleanDir(path.join(__dirname, '../dist-electron'));
  cleanDir(path.join(__dirname, '../dist'));

  // 1. Build Electron Main/Preload files
  console.log('🔨 Compiling Electron scripts...');
  await esbuild.build({
    entryPoints: [
      path.join(__dirname, '../electron/main.ts'),
      path.join(__dirname, '../electron/preload.ts')
    ],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outdir: path.join(__dirname, '../dist-electron'),
    external: ['electron', 'sqlite3', 'playwright', 'playwright-core', 'better-sqlite3'],
    minify: true,
    format: 'cjs'
  });
  console.log('✅ Electron scripts compiled.');

  // 2. Build Vite React frontend
  console.log('🔨 Compiling React UI bundle...');
  execSync('npx vite build', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
  console.log('✅ React UI bundle compiled.');
  console.log('🎉 Production build complete! Ready for packaging.');
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});

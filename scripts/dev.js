const { spawn } = require('child_process');
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function startDev() {
  // Ensure dist directories exist
  if (!fs.existsSync(path.join(__dirname, '../dist-electron'))) {
    fs.mkdirSync(path.join(__dirname, '../dist-electron'), { recursive: true });
  }

  // 1. Compile Electron main and preload scripts
  const ctx = await esbuild.context({
    entryPoints: [
      path.join(__dirname, '../electron/main.ts'),
      path.join(__dirname, '../electron/preload.ts')
    ],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outdir: path.join(__dirname, '../dist-electron'),
    external: ['electron', 'sqlite3', 'playwright', 'better-sqlite3'],
    sourcemap: 'inline',
    format: 'cjs'
  });

  // Watch for main/preload changes
  await ctx.watch();
  console.log('⚡ Electron scripts compiler watching for changes...');

  // 2. Start Vite Dev Server
  const viteProcess = spawn('npx', ['vite'], {
    shell: true,
    stdio: ['inherit', 'pipe', 'inherit'],
    cwd: path.join(__dirname, '..')
  });

  let electronStarted = false;
  let electronProcess = null;
  let accumulatedOutput = '';

  const startElectron = (devUrl) => {
    if (electronStarted) return;
    electronStarted = true;
    console.log(`🚀 Starting Electron pointing to ${devUrl}...`);

    electronProcess = spawn('npx', ['electron', '.'], {
      shell: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: devUrl
      }
    });

    electronProcess.on('close', () => {
      console.log('🛑 Electron closed, shutting down services.');
      ctx.dispose();
      viteProcess.kill();
      process.exit(0);
    });
  };

  // Safety fallback: launch Electron after 5.0s if output parsing fails
  const fallbackTimer = setTimeout(() => {
    if (!electronStarted) {
      console.log('⏳ Dev server URL parsing timed out. Using default fallback URL...');
      startElectron('http://127.0.0.1:5173/');
    }
  }, 5000);

  viteProcess.stdout.on('data', (data) => {
    const rawOutput = data.toString();
    process.stdout.write(data);

    // Strip ANSI codes
    const cleanOutput = rawOutput.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    accumulatedOutput += cleanOutput;

    if (!electronStarted && (accumulatedOutput.includes('localhost:') || accumulatedOutput.includes('127.0.0.1:'))) {
      const match = accumulatedOutput.match(/http:\/\/(localhost|127\.0\.0\.1):(\d+)\/?/);
      if (match) {
        clearTimeout(fallbackTimer);
        startElectron(match[0]);
      }
    }
  });

  viteProcess.on('close', () => {
    if (electronProcess) {
      electronProcess.kill();
    }
    process.exit(0);
  });
}

startDev().catch((err) => {
  console.error('Fatal error in dev script:', err);
  process.exit(1);
});

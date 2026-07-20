const { _electron, chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

let electronApp = null;
let browser = null;
let page = null;
let server = null;

// Start a lightweight HTTP server to serve the React built folder for mock browser fallback
function startStaticServer(distPath, port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let urlPath = req.url.split('?')[0];
      let filePath = path.join(distPath, urlPath === '/' ? 'index.html' : urlPath);
      
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distPath, 'index.html');
      }
      
      const ext = path.extname(filePath);
      let contentType = 'text/html';
      if (ext === '.js') contentType = 'text/javascript';
      else if (ext === '.css') contentType = 'text/css';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.json') contentType = 'application/json';
      
      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(500);
          res.end('Error loading file');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
        }
      });
    });
    
    srv.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && port !== 0) {
        console.warn(`E2E Port ${port} is in use, falling back to random dynamic port...`);
        srv.listen(0, () => {
          resolve(srv);
        });
      } else {
        reject(err);
      }
    });

    srv.listen(port, () => {
      resolve(srv);
    });
  });
}

async function launchApp(env = {}) {
  // Isolate state by using TEST_USER_DATA_DIR or temporary test dir
  const testUserDataDir = process.env.TEST_USER_DATA_DIR || path.join(__dirname, '../temp-user-data');
  if (!fs.existsSync(testUserDataDir)) {
    fs.mkdirSync(testUserDataDir, { recursive: true });
  }

  const useMockBrowser = process.env.USE_MOCK_BROWSER === 'true';

  if (!useMockBrowser) {
    try {
      console.log('🚀 AppHelper: Launching Electron process...');
      electronApp = await _electron.launch({
        args: [
          path.join(__dirname, '../../../dist-electron/main.js'),
          '--no-sandbox',
          '--disable-gpu'
        ],
        env: {
          ...process.env,
          TEST_USER_DATA_DIR: testUserDataDir,
          ...env
        }
      });
      page = await electronApp.firstWindow();
      return { electronApp, page, testUserDataDir, mode: 'electron' };
    } catch (err) {
      console.warn('⚠️ AppHelper: Failed to launch Electron directly (likely headless/CI env). Falling back to mock browser E2E mode...');
    }
  }

  // Fallback / Mock Browser mode (extremely robust for headless/CI environments)
  console.log('🌐 AppHelper: Launching Playwright Chromium with local server fallback...');
  const distPath = path.join(__dirname, '../../../dist');
  const initialPort = process.env.E2E_PORT ? parseInt(process.env.E2E_PORT) : 9876;
  server = await startStaticServer(distPath, initialPort);
  const port = server.address().port;
  console.log(`🌐 Server listening on port: ${port}`);
  
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  
  const context = await browser.newContext();
  page = await context.newPage();
  await page.goto(`http://localhost:${port}`);
  
  return { browser, page, testUserDataDir, mode: 'browser' };
}

async function teardownApp() {
  if (electronApp) {
    await electronApp.close();
    electronApp = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
  page = null;
}

module.exports = {
  launchApp,
  teardownApp
};

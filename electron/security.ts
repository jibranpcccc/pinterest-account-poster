import { app, session, WebContents, shell } from 'electron';

export function setupSecurity() {
  // 1. Set Content Security Policy in HTTP headers or via session headers
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: file: media: https:; connect-src 'self' http: https:;"
        ]
      }
    });
  });

  // 2. Deny permission requests (e.g. geolocation, camera, mic) for safety
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    // Only allow essential permissions if any, otherwise deny
    const allowedPermissions: string[] = ['clipboard-read', 'clipboard-write'];
    if (allowedPermissions.includes(permission)) {
      return callback(true);
    }
    console.log(`🔒 Security: Denied permission request for '${permission}'`);
    callback(false);
  });

  // 3. Limit navigations to prevent Phishing and loading untrusted websites inside the app
  app.on('web-contents-created', (event, contents) => {
    contents.on('will-navigate', (navigationEvent, navigationUrl) => {
      // Allow local development server and local file scheme loading
      const url = new URL(navigationUrl);
      if (url.protocol === 'file:' || (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
        return;
      }
      
      console.warn(`🔒 Security: Blocked renderer navigation to: ${navigationUrl}`);
      navigationEvent.preventDefault();
      // If user navigated to an external web page, open it in their real desktop browser
      if (navigationUrl.startsWith('https://') || navigationUrl.startsWith('http://')) {
        shell.openExternal(navigationUrl).catch((err) => {
          console.error(`Failed to open external link: ${navigationUrl}`, err);
        });
      }
    });

    // Safely open external links in default desktop browser while keeping Electron renderer isolated
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://') || url.startsWith('http://')) {
        console.log(`🌐 Opening external link in browser: ${url}`);
        shell.openExternal(url).catch((err) => {
          console.error(`Failed to open external URL: ${url}`, err);
        });
      } else {
        console.warn(`🔒 Security: Blocked window open to non-web protocol: ${url}`);
      }
      return { action: 'deny' };
    });
  });
}

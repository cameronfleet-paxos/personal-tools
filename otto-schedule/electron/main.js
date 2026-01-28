const { app, BrowserWindow, shell, Notification, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

let mainWindow;
let serverProcess;
let serverPort;

// Find an available port (start at 3200 to avoid conflict with other apps)
function findAvailablePort(startPort = 3200) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      resolve(findAvailablePort(startPort + 1));
    });
  });
}

// Wait for server to be ready
function waitForServer(port, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.on('timeout', () => {
        socket.destroy();
        retry();
      });
      socket.on('error', () => {
        retry();
      });
      socket.connect(port, 'localhost');
    };
    const retry = () => {
      attempts++;
      if (attempts >= maxAttempts) {
        reject(new Error('Server failed to start'));
      } else {
        setTimeout(check, 500);
      }
    };
    check();
  });
}

async function startServer() {
  serverPort = await findAvailablePort();
  console.log(`Starting Next.js server on port ${serverPort}...`);

  const isDev = !app.isPackaged;

  // Set environment for the server
  const env = {
    ...process.env,
    PORT: serverPort.toString(),
    HOSTNAME: 'localhost',
    NODE_ENV: 'production',
  };

  // Determine the standalone directory location
  const standaloneDir = isDev
    ? path.join(__dirname, '..', '.next', 'standalone')
    : path.join(process.resourcesPath, 'standalone');

  const serverJs = path.join(standaloneDir, 'server.js');

  // Find node - GUI apps don't have PATH set
  // asdf shims don't work without shell initialization, so we need to find the actual binary
  const fs = require('fs');
  const asdfNodeVersions = [];
  try {
    const asdfNodeDir = path.join(process.env.HOME, '.asdf/installs/nodejs');
    if (fs.existsSync(asdfNodeDir)) {
      const versions = fs.readdirSync(asdfNodeDir)
        .filter(v => /^\d+\.\d+\.\d+$/.test(v))
        .sort((a, b) => {
          // Sort by major version descending to prefer newer versions
          const aMajor = parseInt(a.split('.')[0], 10);
          const bMajor = parseInt(b.split('.')[0], 10);
          return bMajor - aMajor;
        });
      for (const v of versions) {
        asdfNodeVersions.push(path.join(asdfNodeDir, v, 'bin/node'));
      }
    }
  } catch (e) {}

  const nodePaths = [
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
    '/usr/bin/node',
    process.env.HOME + '/.nvm/current/bin/node',
    process.env.HOME + '/.volta/bin/node',
    ...asdfNodeVersions,
    process.env.HOME + '/.asdf/shims/node',
  ];

  let nodePath = 'node';
  for (const p of nodePaths) {
    try {
      require('fs').accessSync(p, require('fs').constants.X_OK);
      nodePath = p;
      break;
    } catch (e) {}
  }

  console.log('Using node at:', nodePath);

  serverProcess = spawn(nodePath, [serverJs], {
    cwd: standaloneDir,
    env,
    stdio: 'pipe',
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`Server: ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`Server Error: ${data}`);
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });

  // Wait for server to be ready
  await waitForServer(serverPort);
  console.log('Server is ready!');
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('Creating window, preload path:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 500,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    title: 'Otto Schedule',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
    backgroundColor: '#0a0a0a',
  });

  // Load the Next.js app
  const url = `http://localhost:${serverPort}`;
  console.log('Loading URL:', url);
  mainWindow.loadURL(url);

  // Log any load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Handle notification requests from renderer
ipcMain.handle('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      silent: false,
    });
    notification.show();
    return true;
  }
  return false;
});

app.whenReady().then(async () => {
  const isDev = !app.isPackaged;

  try {
    if (isDev) {
      // In dev mode, connect to the already-running Next.js dev server
      serverPort = 3002;
      console.log('Development mode: connecting to dev server on port', serverPort);
    } else {
      // In production, start the standalone server
      await startServer();
    }
    createWindow();
  } catch (err) {
    console.error('Failed to start application:', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    console.log('Stopping server...');
    serverProcess.kill();
  }
});

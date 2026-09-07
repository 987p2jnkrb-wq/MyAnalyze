const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, 'public', 'favicon.ico'), // możesz podmienić na własną ikonę
  });

  // --- ZOOM MENU ---
  const menu = Menu.buildFromTemplate([
    {
      label: 'Widok',
      submenu: [
        {
          label: 'Powiększ',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            const current = win.webContents.getZoomFactor();
            win.webContents.setZoomFactor(current + 0.1);
          }
        },
        {
          label: 'Pomniejsz',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const current = win.webContents.getZoomFactor();
            win.webContents.setZoomFactor(Math.max(current - 0.1, 0.2));
          }
        },
        {
          label: 'Resetuj zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => win.webContents.setZoomFactor(1)
        }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

  win.setMenuBarVisibility(false);

  // POPRAWKA: zawsze ładuj index.html względem __dirname
  const indexPath = path.join(__dirname, 'build', 'index.html');
  win.loadFile(indexPath);
  // win.webContents.openDevTools(); // AUTOMATYCZNE OTWIERANIE DEVTOOLS (wyłączone po buildzie)

  // Inject the floating menu bar after DOM is ready
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(`
      if (!window.__menuBarInjected) {
        window.__menuBarInjected = true;
        const script = document.createElement('script');
        script.src = '../renderer-menu-bar.js';
        document.body.appendChild(script);
      }
    `);
  });
}

// Handle restart from renderer
ipcMain.on('app-restart', () => {
  app.relaunch();
  app.exit(0);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

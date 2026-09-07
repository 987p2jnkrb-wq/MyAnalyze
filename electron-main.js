const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const desktopConfig = require("./desktop-config.json");

const API_HOST = desktopConfig.apiHost;
const API_PORT = desktopConfig.apiPort;
let backendProcess = null;
let mainWindow = null;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");

const instanceLock = app.requestSingleInstanceLock();
if (!instanceLock) app.quit();

function waitForBackend(attempts = 60) {
  return new Promise((resolve, reject) => {
    const retry = (remaining) => {
      if (remaining <= 0) return reject(new Error("Backend nie uruchomił się na czas."));
      setTimeout(() => check(remaining - 1), 150);
    };
    const check = (remaining) => {
      const request = http.get(`http://${API_HOST}:${API_PORT}/api/health`, (response) => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else retry(remaining);
      });
      request.setTimeout(500, () => request.destroy());
      request.on("error", () => retry(remaining));
    };
    check(attempts);
  });
}

function prepareUserData() {
  const dataDirectory = app.getPath("userData");
  fs.mkdirSync(dataDirectory, { recursive: true });
  const databasePath = path.join(dataDirectory, "myanalyz.sqlite");
  if (!fs.existsSync(databasePath)) {
    const templatePath = app.isPackaged
      ? path.join(process.resourcesPath, "db-template", "myanalyz.sqlite")
      : path.join(__dirname, "dbmigration", "myanalyz.sqlite");
    fs.copyFileSync(templatePath, databasePath);
  }
  return { dataDirectory, databasePath };
}

function startBackend(dataDirectory, databasePath) {
  const backendPath = path.join(app.getAppPath(), "backend-dist", "index.js");
  backendProcess = spawn(process.execPath, [backendPath], {
    cwd: dataDirectory,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(API_PORT),
      MYANALYZE_DB_PATH: databasePath,
      MYANALYZE_DATA_DIR: dataDirectory,
    },
  });
  backendProcess.stdout.on("data", (data) => console.log(`Backend: ${data}`));
  backendProcess.stderr.on("data", (data) => console.error(`Backend error: ${data}`));
  backendProcess.on("close", (code) => console.log(`Backend process exited with code ${code}`));
}

function createWindow() {
  if (mainWindow) return;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 640,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  void mainWindow.loadFile(path.join(app.getAppPath(), "myanalyze-frontend", "build", "index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}

if (instanceLock) {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      const { dataDirectory, databasePath } = prepareUserData();
      startBackend(dataDirectory, databasePath);
      await waitForBackend();
      createWindow();
    } catch (error) {
      dialog.showErrorBox("Nie udało się uruchomić MyAnalyze", error instanceof Error ? error.message : String(error));
      app.quit();
    }
  });

  app.on("activate", () => { if (!mainWindow) createWindow(); });
}

app.on("before-quit", () => {
  if (backendProcess && !backendProcess.killed) backendProcess.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

const { contextBridge, ipcRenderer } = require('electron');
const desktopConfig = require('./desktop-config.json');

const API_URL = `http://${desktopConfig.apiHost}:${desktopConfig.apiPort}`;

contextBridge.exposeInMainWorld('API_URL', API_URL);

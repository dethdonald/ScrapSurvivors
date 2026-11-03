// Electron entry point: one game window, no menu bar.
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Saved settings, customisation and patches live in %APPDATA%\\ScrapSurvivors. The game used to be called Scrapfall:
// on the first launch under the new name, the old save folder is copied across so nothing is lost.
try {
  const appData = app.getPath('appData'), dir = path.join(appData, 'ScrapSurvivors'), old = path.join(appData, 'scrapfall');
  if (!fs.existsSync(dir) && fs.existsSync(old)) fs.cpSync(old, dir, { recursive: true });
  app.setPath('userData', dir);
} catch (e) {}

// Errors from the game are appended to scrapsurvivors-log.txt so problems can be diagnosed.
function logPath() { return path.join(app.isPackaged ? app.getPath('userData') : __dirname, 'scrapsurvivors-log.txt'); }
function log(line) { try { fs.appendFileSync(logPath(), `[${new Date().toISOString()}] ${line}\n`); } catch (e) {} }
process.on('uncaughtException', err => log('main: ' + (err && err.stack || err)));

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0d1216',
    title: 'Scrap Survivors',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);
  // the page picks its Steam Deck layout from ?deck=1 (it also spots a 1280x800 screen on its own)
  const deck = process.env.SteamDeck === '1' || process.argv.includes('--deck');
  win.loadFile(path.join(__dirname, 'index.html'), deck ? { query: { deck: '1' } } : {});

  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    const lv = e && e.level !== undefined ? e.level : level;
    const msg = e && e.message !== undefined ? e.message : message;
    const src = e && e.sourceId !== undefined ? `${e.sourceId}:${e.lineNumber}` : `${sourceId}:${line}`;
    if (lv === 3 || lv === 'error' || lv === 2 || lv === 'warning') log(`renderer ${lv}: ${msg} (${src})`);
  });
  win.webContents.on('did-fail-load', (e, code, desc, url) => log(`load failed ${code} ${desc} ${url}`));
  win.webContents.on('render-process-gone', (e, d) => log('renderer gone: ' + JSON.stringify(d)));

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); event.preventDefault(); }
  });

  // Steam Deck / gaming mode: start fullscreen when asked or when Steam launches us.
  if (process.argv.includes('--fullscreen') || process.env.SteamDeck === '1' || process.env.SteamAppId) {
    win.setFullScreen(true);
  }
}

ipcMain.on('quit', () => app.quit());
ipcMain.on('toggle-fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

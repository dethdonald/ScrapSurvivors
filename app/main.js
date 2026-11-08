// Electron entry point: one game window, no menu bar.
const { app, BrowserWindow, Menu, ipcMain, net } = require('electron');
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

/* ---------- update status for the title screen ----------
   Compares this copy's VERSION with the one on GitHub (dethdonald/ScrapSurvivors, main). The private repo needs the
   read-only token in github-token.txt next to the game's exe / ScrapSurvivors.sh. Packaged builds only (the dev copy
   started with Play.bat shows nothing). The Windows build's starter (tools/bootstrap.js) downloads updates into
   %APPDATA%\ScrapSurvivors\game-files\pending and switches to them on the next start; the Deck launcher updates on start. */
const UPD_REPO = 'dethdonald/ScrapSurvivors';
const verIn = dir => { try { return fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').trim(); } catch (e) { return ''; } };
const verNewer = (a, b) => { const x = String(a).split('.').map(n => +n || 0), y = String(b).split('.').map(n => +n || 0); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
let updCache = null;
async function updateStatus() {
  const local = verIn(__dirname);
  if (!app.isPackaged) return { state: 'dev', local };
  if (updCache && Date.now() - updCache.at < 60000 && updCache.res.state !== 'downloading') return updCache.res;
  let tok = ''; try { tok = fs.readFileSync(path.join(path.dirname(process.execPath), 'github-token.txt'), 'utf8').trim(); } catch (e) {}
  let res;
  try {
    const url = tok ? `https://api.github.com/repos/${UPD_REPO}/contents/VERSION?ref=main` : `https://raw.githubusercontent.com/${UPD_REPO}/main/VERSION?t=${Date.now()}`;
    const headers = Object.assign({ 'User-Agent': 'ScrapSurvivors-updater' }, tok ? { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github.raw' } : {});
    const r = await net.fetch(url, { headers, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (r.status !== 200) throw new Error(r.status === 404 && !tok ? 'noaccess' : 'HTTP ' + r.status);
    const remote = (await r.text()).trim();
    if (!/^[0-9.]{1,32}$/.test(remote)) throw new Error('odd VERSION');
    if (!verNewer(remote, local)) res = { state: 'current', local, remote };
    else if (process.platform === 'win32') {
      const pend = verIn(path.join(app.getPath('appData'), 'ScrapSurvivors', 'game-files', 'pending'));
      res = { state: pend && !verNewer(remote, pend) ? 'ready' : 'downloading', local, remote };
    } else res = { state: 'available', local, remote };
  } catch (e) { res = { state: 'error', local, reason: e.message === 'noaccess' ? 'noaccess' : 'offline' }; log('update status: ' + e.message); }
  updCache = { at: Date.now(), res };
  return res;
}
ipcMain.handle('update-status', () => updateStatus());
// restart into the downloaded update (Windows build: the starter switches to it as it boots)
ipcMain.on('restart', () => { app.relaunch(); app.exit(0); });

ipcMain.on('quit', () => app.quit());
ipcMain.on('toggle-fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

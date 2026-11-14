/* In-app updater for the Linux / Steam Deck build.
   Downloads the game's files from GitHub with Electron's own network stack, unpacks them with Node's own zlib, and
   swaps the app folder: no curl, no tar, no shell. That matters on the Deck: the launcher script's curl runs inside
   whatever environment Steam hands it (Gaming Mode preloads Steam's own libraries), and when that fails the script
   can only start the old version silently. This path does not depend on any of it, and it reports progress.
   Kept free of Electron imports so it can be tested with plain Node (fetchFn is passed in). */
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const cstr = (b, a, n) => { let e = a; while (e < a + n && b[e] !== 0) e++; return b.toString('utf8', a, e); };
/* a minimal tar reader (ustar + the pax / GNU long-name records GitHub's archives use) */
function untar(buf, onEntry) {
  let off = 0, longName = null;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h[0] === 0) break;                                           // the end-of-archive blocks
    let name = cstr(h, 0, 100); const prefix = cstr(h, 345, 155); if (prefix) name = prefix + '/' + name;
    const size = parseInt(cstr(h, 124, 12).trim() || '0', 8) || 0, type = h[156] ? String.fromCharCode(h[156]) : '0', mode = parseInt(cstr(h, 100, 8).trim() || '644', 8) || 0o644;
    off += 512; const data = buf.subarray(off, off + size); off += Math.ceil(size / 512) * 512;
    if (type === 'g') continue;                                      // global pax header (the commit id)
    if (type === 'x') { const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data.toString('utf8')); if (m) longName = m[1]; continue; }
    if (type === 'L') { longName = data.toString('utf8').replace(/\0+$/, ''); continue; }
    if (longName) { name = longName; longName = null; }
    onEntry(name, type, data, mode);
  }
}
const sameFile = (a, b) => { try { return fs.readFileSync(a).equals(fs.readFileSync(b)); } catch (e) { return false; } };

/* opts: { appDir, binDir, repo, token, fetchFn, onProgress(stage, detail) }
   Resolves { version, relaunch } - relaunch is true when main.js / preload.js / package.json changed (those are already
   loaded in this process, so a window reload isn't enough). Throws with a readable message on any failure, leaving the
   current version untouched. */
async function applyUpdate(opts) {
  const { appDir, binDir, repo, token, fetchFn } = opts, say = opts.onProgress || (() => {});
  const url = token ? `https://api.github.com/repos/${repo}/tarball/main` : `https://codeload.github.com/${repo}/tar.gz/refs/heads/main`;
  const headers = Object.assign({ 'User-Agent': 'ScrapSurvivors-updater' }, token ? { Authorization: 'Bearer ' + token } : {});
  say('connect', '');
  const r = await fetchFn(url, { headers, cache: 'no-store' });
  if (!r.ok) throw new Error(r.status === 404 || r.status === 401 || r.status === 403 ? 'GitHub refused the download (check github-token.txt)' : 'GitHub answered ' + r.status);
  const total = +r.headers.get('content-length') || 0, chunks = []; let got = 0;
  if (r.body && r.body.getReader) {
    const rd = r.body.getReader();
    for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(Buffer.from(value)); got += value.length; say('download', total ? Math.round(got / total * 100) + '%' : (got / 1024 | 0) + ' KB'); }
  } else { const b = Buffer.from(await r.arrayBuffer()); chunks.push(b); got = b.length; }
  if (got < 20000) throw new Error('the download was too small to be the game');
  say('unpack', '');
  const tar = zlib.gunzipSync(Buffer.concat(chunks));
  const fresh = appDir + '.new', old = appDir + '.old';
  fs.rmSync(fresh, { recursive: true, force: true }); fs.rmSync(old, { recursive: true, force: true });
  const deck = []; let files = 0;
  untar(tar, (name, type, data, mode) => {
    const parts = name.split('/').filter(Boolean); parts.shift();     // drop GitHub's "<owner>-<repo>-<commit>/" folder
    if (!parts.length || parts.some(p => p === '..')) return;
    if (parts[0] === 'deck' && parts.length === 2 && type === '0' && /\.sh$/.test(parts[1])) { deck.push([parts[1], Buffer.from(data)]); return; }
    if (parts[0] !== 'app') return;
    const dest = path.join(fresh, ...parts.slice(1));
    if (type === '5') { fs.mkdirSync(dest, { recursive: true }); return; }
    if (type !== '0') return;                                          // (no links or devices in the game's files)
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, data, { mode: mode & 0o777 }); files++;
  });
  const ok = ['index.html', 'main.js', 'VERSION'].every(f => fs.existsSync(path.join(fresh, f)));
  if (!ok || files < 20) { fs.rmSync(fresh, { recursive: true, force: true }); throw new Error('the download looked incomplete, kept the current version'); }
  const version = fs.readFileSync(path.join(fresh, 'VERSION'), 'utf8').trim();
  const relaunch = !['main.js', 'preload.js', 'package.json', 'updater.js'].every(f => sameFile(path.join(appDir, f), path.join(fresh, f)) || (!fs.existsSync(path.join(appDir, f)) && !fs.existsSync(path.join(fresh, f))));
  say('install', version);
  fs.renameSync(appDir, old);
  try { fs.renameSync(fresh, appDir); } catch (e) { fs.renameSync(old, appDir); throw new Error('could not switch to the new files: ' + e.message); }
  fs.rmSync(old, { recursive: true, force: true });
  // the launcher scripts next to the game come along too (used from the next start)
  for (const [f, data] of deck) { try { const p = path.join(binDir, f); fs.writeFileSync(p + '.new', data, { mode: 0o755 }); fs.renameSync(p + '.new', p); } catch (e) {} }
  return { version, relaunch, files };
}
module.exports = { applyUpdate, untar };

// Office display windows (Admin → Office displays): one window per display,
// on the monitor chosen for it, showing /display with that display's own
// credential. A display window never shares the main window's sign-in: it
// has its own in-memory session (nothing saved to disk), can't navigate away
// from /display, and gets the credential from the main process, never from a
// URL. Windows' own display settings are never changed; a TV must already be
// set to Extend these displays.
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const TOKEN = /^[a-f0-9]{64}$/;
const FILE = 'office-displays.json';

function createDisplayManager({ BrowserWindow, screen, fs, path, userData, appOrigin, preload, onChange = () => {}, log = () => {} }) {
  const open = new Map(); // display id -> { win, name, token, closing }
  const byContents = new Map(); // webContents id -> display id
  const file = path.join(userData, FILE);
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { saved = {}; }
  const persist = () => { try { fs.writeFileSync(file, JSON.stringify(saved)); } catch (e) { log('Could not save display placement', e); } };

  const screens = () => {
    const primary = screen.getPrimaryDisplay();
    return screen.getAllDisplays().map((d, i) => ({
      id: String(d.id), label: d.label || `Screen ${i + 1}`, primary: d.id === primary.id,
      width: d.size?.width || d.bounds.width, height: d.size?.height || d.bounds.height, scale: d.scaleFactor || 1,
    }));
  };
  // The chosen monitor if it's connected; else the first one that isn't the
  // main screen; else the main screen.
  const target = (screenId) => {
    const all = screen.getAllDisplays(), primary = screen.getPrimaryDisplay();
    return all.find((d) => String(d.id) === String(screenId)) || all.find((d) => d.id !== primary.id) || primary;
  };
  const inside = (b, area) => b && area && b.width >= 400 && b.height >= 300 && b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height;
  const state = () => [...open.entries()].map(([id, o]) => ({
    id, name: o.name, fullscreen: !o.win.isDestroyed() && o.win.isFullScreen(), minimized: !o.win.isDestroyed() && o.win.isMinimized(),
    screen_id: o.win.isDestroyed() ? null : String(screen.getDisplayMatching(o.win.getBounds()).id),
  }));
  const changed = () => { try { onChange(state()); } catch { /* main window gone */ } };

  // Moves made here (opening, a monitor coming or going) aren't the person's
  // choice, so they don't change which monitor the display prefers.
  function place(win, id, screenId, fullscreen) {
    const entry = open.get(id);
    if (entry) entry.autoAt = Date.now();
    const d = target(screenId);
    const remembered = saved[id];
    const bounds = remembered && String(remembered.screen_id) === String(d.id) && inside(remembered.bounds, d.workArea) ? remembered.bounds : d.workArea;
    if (win.isFullScreen()) win.setFullScreen(false);
    win.setBounds(bounds);
    if (fullscreen) win.setFullScreen(true);
  }
  function remember(id) {
    const o = open.get(id);
    if (!o || o.win.isDestroyed() || Date.now() - (o.autoAt || 0) < 2500) return;
    const full = o.win.isFullScreen();
    const d = screen.getDisplayMatching(o.win.getBounds());
    saved[id] = { screen_id: String(d.id), fullscreen: full, bounds: full ? saved[id]?.bounds : o.win.getBounds() };
    persist();
  }

  function openDisplay({ id, token, name, screen_id: screenId, fullscreen }) {
    if (!ID.test(String(id || '')) || !TOKEN.test(String(token || ''))) throw new Error('Invalid display');
    const title = String(name || 'Office display').replace(/[\u0000-\u001F]/g, '').slice(0, 60);
    const wantFull = typeof fullscreen === 'boolean' ? fullscreen : saved[id]?.fullscreen !== false;
    const existing = open.get(id);
    // Never two windows for one display: the open one takes the new
    // credential and moves if a different monitor was chosen.
    if (screenId && String(saved[id]?.screen_id) !== String(screenId)) { saved[id] = { screen_id: String(screenId), fullscreen: wantFull }; persist(); }
    if (existing && !existing.win.isDestroyed()) {
      existing.token = token;
      existing.name = title;
      existing.win.setTitle(`${title} · Office display`);
      if (screenId) place(existing.win, id, screenId, wantFull);
      if (existing.win.isMinimized()) existing.win.restore();
      existing.win.show();
      existing.win.reload();
      changed();
      return { reused: true };
    }
    const d = target(screenId || saved[id]?.screen_id);
    const win = new BrowserWindow({
      ...d.workArea, show: false, title: `${title} · Office display`, backgroundColor: '#0d1520', autoHideMenuBar: true,
      webPreferences: {
        preload, partition: `office-display-${id}`, nodeIntegration: false, nodeIntegrationInWorker: false, contextIsolation: true,
        sandbox: true, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, backgroundThrottling: false,
      },
    });
    win.removeMenu?.();
    const entry = { win, name: title, token, closing: false };
    open.set(id, entry);
    byContents.set(win.webContents.id, id);
    const ses = win.webContents.session;
    // Watching a camera only receives video; a display needs no permissions.
    ses.setPermissionCheckHandler(() => false);
    ses.setPermissionRequestHandler((_c, _p, callback) => callback(false));
    const allowed = (url) => { try { const u = new URL(url); return u.origin === appOrigin && u.pathname === '/display'; } catch { return false; } };
    win.webContents.on('will-navigate', (e, url) => { if (!allowed(url)) e.preventDefault(); });
    win.webContents.on('will-redirect', (e, url) => { if (!allowed(url)) e.preventDefault(); });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-attach-webview', (e) => e.preventDefault());
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'F11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
      else if (input.key === 'Escape' && win.isFullScreen()) { e.preventDefault(); win.setFullScreen(false); }
      else if (input.key === 'F5' || ((input.control || input.meta) && String(input.key).toLowerCase() === 'r')) { e.preventDefault(); win.reload(); }
    });
    win.webContents.on('did-fail-load', (_e, code, _d, url, main) => { if (main && code !== -3) setTimeout(() => { if (!win.isDestroyed()) win.loadURL(`${appOrigin}/display`).catch(() => {}); }, 15_000); });
    win.webContents.on('render-process-gone', () => { setTimeout(() => { if (!win.isDestroyed()) win.reload(); }, 3000); });
    win.once('ready-to-show', () => { place(win, id, d.id, wantFull); win.show(); changed(); });
    let timer;
    const later = () => { clearTimeout(timer); timer = setTimeout(() => remember(id), 800); };
    win.on('move', later); win.on('resize', later);
    win.on('enter-full-screen', () => { later(); changed(); });
    win.on('leave-full-screen', () => { later(); changed(); });
    win.on('minimize', changed); win.on('restore', changed);
    // Closing: let the page end its camera views first (briefly), then close.
    win.on('close', (e) => {
      if (entry.closing) return;
      e.preventDefault();
      entry.closing = true;
      const done = () => { if (!win.isDestroyed()) win.destroy(); };
      const wait = setTimeout(done, 1500);
      win.webContents.executeJavaScript('window.__ttDisplayClose ? window.__ttDisplayClose() : null', true)
        .catch(() => {}).finally(() => { clearTimeout(wait); done(); });
    });
    win.on('closed', () => {
      clearTimeout(timer);
      byContents.delete(entry.webContentsId);
      if (open.get(id) === entry) open.delete(id);
      // The in-memory session goes with the window; clear it anyway.
      ses.clearStorageData?.().catch?.(() => {});
      changed();
    });
    entry.webContentsId = win.webContents.id;
    win.loadURL(`${appOrigin}/display`).catch(() => {});
    return { reused: false };
  }

  // A monitor unplugged or changed: windows on it move to a screen that is
  // still there (and back when it returns), staying full screen if they were.
  function recover() {
    for (const [id, o] of open) {
      if (o.win.isDestroyed()) continue;
      const want = saved[id]?.screen_id;
      const all = screen.getAllDisplays();
      const onScreen = all.find((d) => inside(o.win.getBounds(), d.bounds));
      const preferred = all.find((d) => String(d.id) === String(want));
      if (preferred && (!onScreen || onScreen.id !== preferred.id)) place(o.win, id, preferred.id, o.win.isFullScreen() || saved[id]?.fullscreen !== false);
      else if (!onScreen) place(o.win, id, null, o.win.isFullScreen());
      else if (o.win.isFullScreen()) { o.win.setFullScreen(false); o.win.setFullScreen(true); }
    }
    changed();
  }
  screen.on('display-removed', recover);
  screen.on('display-added', recover);
  screen.on('display-metrics-changed', recover);

  const get = (id) => { const o = open.get(id); if (!o || o.win.isDestroyed()) throw new Error('That display window is not open'); return o; };
  return {
    screens,
    list: state,
    open: openDisplay,
    close(id) { const o = open.get(id); if (o && !o.win.isDestroyed()) o.win.close(); return { ok: true }; },
    closeAll() { for (const o of open.values()) if (!o.win.isDestroyed()) o.win.close(); return { ok: true }; },
    fullscreen(id, on) { const o = get(id); o.win.setFullScreen(typeof on === 'boolean' ? on : !o.win.isFullScreen()); return { ok: true }; },
    refresh(id) { const o = get(id); o.win.reload(); return { ok: true }; },
    show(id) { const o = get(id); if (o.win.isMinimized()) o.win.restore(); o.win.show(); return { ok: true }; },
    // For the display page itself: its credential, only for /display pages.
    credentialFor(contents) {
      const id = byContents.get(contents?.id);
      const o = id && open.get(id);
      if (!o) return null;
      try { const u = new URL(contents.getURL()); if (u.origin !== appOrigin || u.pathname !== '/display') return null; } catch { return null; }
      return o.token;
    },
    count: () => open.size,
  };
}

module.exports = { createDisplayManager };

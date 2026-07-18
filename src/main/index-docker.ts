/**
 * Docker / Headless Entry Point
 *
 * Runs the proxy server under plain Node.js by stubbing the `electron`
 * module via a require hook BEFORE any other module is imported.
 *
 * Usage:
 *   node out/main/index-docker.js
 */

// --- Register electron shim BEFORE importing anything that depends on electron ---
const Module = require('module')
const path = require('path')
const os = require('os')
const { EventEmitter } = require('events')

const USER_DATA_PATH = path.join(os.homedir(), '.chat2api')

class AppShim extends EventEmitter {
  isReady = true
  isQuitting = false
  commandLine = {
    appendSwitch() {},
    hasSwitch() { return false },
    getSwitchValue() { return '' },
  }

  getPath(name: string): string {
    switch (name) {
      case 'userData': return USER_DATA_PATH
      case 'home': return os.homedir()
      case 'temp': return os.tmpdir()
      case 'appData': return USER_DATA_PATH
      default: return USER_DATA_PATH
    }
  }
  getName() { return 'Chat2API' }
  getVersion() {
    try { return require(path.join(process.cwd(), 'package.json')).version || '1.0.0' }
    catch { return '1.0.0' }
  }
  getLocale() { return 'en-US' }
  whenReady() { return Promise.resolve() }
  on(event: string, listener: (...args: any[]) => void): this {
    // Ignore GUI lifecycle events
    return this
  }
  once() { return this }
  quit() { process.exit(0) }
  exit(code = 0) { process.exit(code) }
  relaunch() {}
  requestSingleInstanceLock() { return true }
  setAppUserModelId() {}
}

const appShim = new AppShim()

const safeStorageShim = {
  isEncryptionAvailable() { return false },
  encryptString(data: string) { return Buffer.from(data, 'utf8') },
  decryptString(buf: Buffer) { return buf.toString('utf8') },
}

class BrowserWindowShim {
  constructor(_opts?: any) {}
  loadURL() { return Promise.resolve() }
  loadFile() { return Promise.resolve() }
  on() { return this }
  once() { return this }
  off() { return this }
  show() {}
  hide() {}
  close() {}
  destroy() {}
  isDestroyed() { return false }
  isMinimized() { return false }
  restore() {}
  focus() {}
  webContents = { send() {}, on() {}, openDevTools() {}, closeDevTools() {}, getURL() { return 'about:blank' } }
}

const netShim = {
  request(options: any, cb?: any) {
    const proto = (typeof options === 'string' ? options : options.url || '').startsWith('https') ? 'https' : 'http'
    return require(proto).request(options, cb)
  },
}

const shellShim = {
  openExternal(url: string) { return Promise.resolve() },
  openPath() { return Promise.resolve('') },
  showItemInFolder() {},
  moveItemToTrash() { return Promise.resolve(true) },
}

const ipcMainShim = { on() {}, off() {}, once() {}, handle() {}, removeHandler() {}, emit() { return true } }
const ipcRendererShim = { send() {}, on() {}, off() {}, invoke() { return Promise.resolve() } }

const electronShim = {
  app: appShim,
  safeStorage: safeStorageShim,
  BrowserWindow: BrowserWindowShim,
  net: netShim,
  shell: shellShim,
  ipcMain: ipcMainShim,
  ipcRenderer: ipcRendererShim,
  Tray: class { destroy() {} on() {} setContextMenu() {} setToolTip() {} setImage() {} },
  Menu: { buildFromTemplate() { return {} }, setApplicationMenu() {} },
  nativeImage: { createFromPath() { return {} }, createFromBuffer() { return {} } },
  session: { defaultSession: { webRequest: {} } },
  clipboard: { readText() { return '' }, writeText() {} },
  dialog: { showMessageBox() { return Promise.resolve({ response: 0 }) }, showErrorBox() {} },
  Notification: class { show() {} on() {} close() {} },
  screen: { getPrimaryDisplay() { return { workAreaSize: { width: 1920, height: 1080 } } } },
  powerMonitor: { on() {} },
  systemPreferences: { getUserDefault() { return '' } },
}

// Hook Node's module loader so `require('electron')` returns the shim.
const originalResolve = (Module as any)._resolveFilename
;(Module as any)._resolveFilename = function (request: string, ...rest: any[]) {
  if (request === 'electron') {
    // Return a fake filename that maps to our shim
    return require.resolve('./electron-shim-impl.js')
  }
  return originalResolve.call(this, request, ...rest)
}

const originalLoad = (Module as any)._load
;(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  if (request === 'electron') {
    return electronShim
  }
  return originalLoad.call(this, request, parent, isMain)
}

// Also intercept dynamic `await import('electron')`
const originalImport = (Module as any).prototype.import
if (typeof originalImport === 'function') {
  ;(Module as any).prototype.import = async function (spec: string) {
    if (spec === 'electron') return electronShim
    return originalImport.call(this, spec)
  }
}

console.log('[Docker] Electron shim registered, starting headless server...')

// --- Now import the application modules ---
const { proxyServer } = require('./proxy/server')
const { storeManager } = require('./store/store')

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
})

async function startHeadlessServer(): Promise<void> {
  console.log('[Docker] Starting Chat2API in headless mode...')

  await appShim.whenReady()

  try {
    await storeManager.initialize()
    console.log('[Docker] Store manager initialized')

    const config = storeManager.getConfig()
    const port = (config as any).proxyPort || process.env.PORT || 8080
    const host = (config as any).proxyHost || process.env.HOST || '0.0.0.0'

    const success = await proxyServer.start(Number(port), host)

    if (success) {
      console.log(`[Docker] Proxy server started successfully on ${host}:${port}`)
      console.log('[Docker] API endpoints available:')
      console.log('[Docker]   - GET  /v1/models')
      console.log('[Docker]   - POST /v1/chat/completions')
      console.log('[Docker]   - POST /v1/completions')
      console.log('[Docker]   - GET  /health')
    } else {
      console.error('[Docker] Failed to start proxy server')
      process.exit(1)
    }
  } catch (error) {
    console.error('[Docker] Failed to initialize:', error)
    process.exit(1)
  }
}

process.on('SIGINT', () => {
  console.log('[Docker] Received SIGINT, shutting down...')
  try { storeManager.flushPendingWrites() } catch {}
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('[Docker] Received SIGTERM, shutting down...')
  try { storeManager.flushPendingWrites() } catch {}
  process.exit(0)
})

startHeadlessServer().catch((error) => {
  console.error('[Docker] Fatal error:', error)
  process.exit(1)
})

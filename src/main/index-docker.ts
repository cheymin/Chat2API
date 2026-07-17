/**
 * Docker Entry Point - Headless API Server
 * Starts only the proxy server without Electron GUI
 */

import { app } from 'electron'
import { proxyServer } from './proxy/server'
import { storeManager } from './store/store'

// Prevent uncaught exceptions from crashing the app
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
})

async function startHeadlessServer(): Promise<void> {
  console.log('[Docker] Starting Chat2API in headless mode...')

  // Wait for app to be ready (but skip full GUI initialization)
  await app.whenReady()

  try {
    // Initialize store manager
    await storeManager.initialize()
    console.log('[Docker] Store manager initialized')

    // Get configuration
    const config = storeManager.getConfig()
    const port = config.proxyPort || 8080
    const host = config.proxyHost || '0.0.0.0'

    // Start proxy server
    const success = await proxyServer.start(port, host)

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

// Handle app quit
app.on('before-quit', () => {
  console.log('[Docker] Application is exiting...')
  storeManager.flushPendingWrites()
})

// Start the server
startHeadlessServer().catch((error) => {
  console.error('[Docker] Fatal error:', error)
  process.exit(1)
})
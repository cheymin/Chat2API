/**
 * Universal Web API Adapter
 *
 * 管理 universal-web-api Python 子进程并通过 HTTP 转发聊天请求。
 * 集成自 https://github.com/lumingya/universal-web-api
 *
 * - 子进程默认监听 127.0.0.1:18199（避免与原始 8199 端口冲突）
 * - 负责启动 / 健康检查 / 停止子进程
 * - /v1/chat/completions 通过 axios 转发
 * - 流式响应直接 pipe SSE
 */

import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import axios, { AxiosResponse } from 'axios'
import { Account, Provider } from '../../store/types'

const UW_SCRIPT_NAME = 'main.py'
const UW_SUBPROXY_PORT_BASE = 18199
const UW_STARTUP_TIMEOUT_MS = 60000
const UW_HEALTH_CHECK_INTERVAL_MS = 3000
const UW_HEALTH_CHECK_TIMEOUT_MS = 5000

interface UWProcessInfo {
  child: ChildProcess
  port: number
  ready: boolean
}

class UWProcessManager {
  private static instance: UWProcessManager | null = null
  private procs: Map<string, UWProcessInfo> = new Map()
  private nextPort = UW_SUBPROXY_PORT_BASE

  static getInstance(): UWProcessManager {
    if (!UWProcessManager.instance) {
      UWProcessManager.instance = new UWProcessManager()
    }
    return UWProcessManager.instance
  }

  private findUWScriptDir(): string {
    let dir = __dirname
    for (let i = 0; i < 10; i++) {
      const candidate = path.join(dir, 'third_party', 'universal-web-api')
      if (fs.existsSync(path.join(candidate, UW_SCRIPT_NAME))) {
        return candidate
      }
      dir = path.dirname(dir)
    }
    const cwdCandidate = path.join(process.cwd(), 'backend', 'third_party', 'universal-web-api')
    if (fs.existsSync(path.join(cwdCandidate, UW_SCRIPT_NAME))) {
      return cwdCandidate
    }
    throw new Error('universal-web-api 脚本未找到。请确保 backend/third_party/universal-web-api/main.py 存在。')
  }

  private findPython(pythonPath?: string): string {
    if (pythonPath) return pythonPath
    const candidates = ['python3', 'python', 'py']
    for (const name of candidates) {
      try {
        const result = require('child_process').spawnSync(name, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'])
        if (result.status === 0) return name
      } catch { /* next */ }
    }
    return 'python3'
  }

  async ensureStarted(
    key: string,
    opts: { pythonPath?: string; apiKey?: string } = {}
  ): Promise<{ port: number; baseUrl: string }> {
    const existing = this.procs.get(key)
    if (existing && existing.child.exitCode === null && existing.ready) {
      return { port: existing.port, baseUrl: `http://127.0.0.1:${existing.port}` }
    }

    const uwDir = this.findUWScriptDir()
    const python = this.findPython(opts.pythonPath)
    const port = this.allocatePort()

    console.log(`[Universal] 启动子服务: ${python} main.py --port ${port} (cwd: ${uwDir})`)

    const child = spawn(python, [UW_SCRIPT_NAME, '--port', String(port)], {
      cwd: uwDir,
      env: {
        ...process.env,
        UW_API_KEY: opts.apiKey || '',
        // 关闭自动打开浏览器（我们在受控环境里跑）
        UW_AUTO_OPEN_BROWSER: 'false',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim()
      if (text && /error|Error|ERROR|listening|started|ready|health/i.test(text)) {
        console.log(`[Universal] ${text}`)
      }
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim()
      if (text) console.error(`[Universal stderr] ${text}`)
    })

    child.on('exit', (code, signal) => {
      console.warn(`[Universal] 子服务退出: code=${code}, signal=${signal}`)
      const entry = this.procs.get(key)
      if (entry) entry.ready = false
    })

    this.procs.set(key, { child, port, ready: false })

    await this.waitUntilHealthy(port, UW_STARTUP_TIMEOUT_MS)
    const info = this.procs.get(key)!
    info.ready = true

    return { port, baseUrl: `http://127.0.0.1:${port}` }
  }

  private allocatePort(): number {
    const used = new Set(Array.from(this.procs.values()).map(p => p.port))
    let port = this.nextPort
    while (used.has(port)) port++
    this.nextPort = port + 1
    return port
  }

  private async waitUntilHealthy(port: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const resp = await axios.get(`http://127.0.0.1:${port}/health`, {
          timeout: UW_HEALTH_CHECK_TIMEOUT_MS,
          validateStatus: () => true,
        })
        if (resp.status < 500) {
          console.log(`[Universal] 子服务就绪 (port ${port})`)
          return
        }
      } catch { /* retry */ }
      await new Promise(r => setTimeout(r, UW_HEALTH_CHECK_INTERVAL_MS))
    }
    throw new Error(`Universal Web API 子服务在 ${timeoutMs}ms 内未就绪 (port ${port})。请检查是否有 Chrome/Chromium 浏览器可用，以及 requirements 是否已安装。`)
  }

  stop(key: string): void {
    const info = this.procs.get(key)
    if (info) {
      try { info.child.kill('SIGTERM') } catch { /* ignore */ }
      this.procs.delete(key)
    }
  }

  stopAll(): void {
    for (const key of Array.from(this.procs.keys())) this.stop(key)
  }
}

export class UniversalAdapter {
  private provider: Provider
  private account: Account
  private pm = UWProcessManager.getInstance()

  constructor(provider: Provider, account: Account) {
    this.provider = provider
    this.account = account
  }

  static isUniversalProvider(provider: Provider): boolean {
    return provider.id === 'universal' || provider.apiEndpoint?.includes('18199')
  }

  private getProcessKey(): string {
    return `uw-${this.account.id}`
  }

  async chatCompletion(request: any): Promise<{ response: AxiosResponse }> {
    const c = this.account.credentials as any
    const { baseUrl } = await this.pm.ensureStarted(this.getProcessKey(), {
      pythonPath: c.pythonPath,
      apiKey: c.apiKey,
    })

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': request.stream ? 'text/event-stream' : 'application/json',
    }
    if (c.apiKey) headers['x-api-key'] = c.apiKey

    const body: any = {
      model: request.model,
      messages: request.messages,
      stream: request.stream || false,
    }
    if (request.temperature !== undefined) body.temperature = request.temperature
    if (request.tools !== undefined) body.tools = request.tools
    if (request.tool_choice !== undefined) body.tool_choice = request.tool_choice
    if (request.max_tokens !== undefined) body.max_tokens = request.max_tokens

    const response = await axios.post(`${baseUrl}/v1/chat/completions`, body, {
      headers,
      timeout: 600000,
      responseType: request.stream ? 'stream' : 'json',
      validateStatus: () => true,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })

    return { response }
  }
}

process.on('exit', () => UWProcessManager.getInstance().stopAll())
process.on('SIGTERM', () => UWProcessManager.getInstance().stopAll())

export const universalAdapter = { UniversalAdapter }
export default universalAdapter

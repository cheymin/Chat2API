/**
 * WorkBuddy Adapter
 * 
 * 管理 workbuddy2api-hub Python 子进程，并通过 HTTP 转发聊天请求。
 * 集成自 https://github.com/ardeyouxipianyi/workbuddy2api-hub
 * 
 * - workbuddy 子服务监听本地环回 127.0.0.1:18788
 * - adapter 负责启动 / 健康检查 / 停止子进程
 * - chat 请求通过 axios 转发到子服务的 /v1/chat/completions
 * - 流式响应直接 pipe SSE
 */

import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import axios, { AxiosResponse } from 'axios'
import { Account, Provider } from '../../store/types'

// --- 常量 ---

const WB_SCRIPT_NAME = 'wb_proxy.py'
const WB_SUBPROXY_PORT_BASE = 18788
const WB_STARTUP_TIMEOUT_MS = 30000
const WB_HEALTH_CHECK_INTERVAL_MS = 2000
const WB_HEALTH_CHECK_TIMEOUT_MS = 5000

// --- 子进程管理器 ---

interface WorkbuddyProcessInfo {
  child: ChildProcess
  port: number
  startedAt: number
  ready: boolean
  rejectHealthPromise: ((err: Error) => void) | null
}

class WorkbuddyProcessManager {
  private static instance: WorkbuddyProcessManager | null = null
  private procs: Map<string, WorkbuddyProcessInfo> = new Map()
  private nextPort = WB_SUBPROXY_PORT_BASE

  static getInstance(): WorkbuddyProcessManager {
    if (!WorkbuddyProcessManager.instance) {
      WorkbuddyProcessManager.instance = new WorkbuddyProcessManager()
    }
    return WorkbuddyProcessManager.instance
  }

  /** 找到 workbuddy 脚本所在目录（vendor/third_party） */
  private findWbScriptDir(): string {
    // 编译后：dist/backend/proxy/adapters/workbuddy.js → 向上找 third_party/workbuddy
    let dir = __dirname
    for (let i = 0; i < 10; i++) {
      const candidate = path.join(dir, 'third_party', 'workbuddy')
      if (fs.existsSync(path.join(candidate, WB_SCRIPT_NAME))) {
        return candidate
      }
      dir = path.dirname(dir)
    }
    // fallback：相对 cwd
    const cwdCandidate = path.join(process.cwd(), 'backend', 'third_party', 'workbuddy')
    if (fs.existsSync(path.join(cwdCandidate, WB_SCRIPT_NAME))) {
      return cwdCandidate
    }
    throw new Error('workbuddy2api-hub 脚本未找到。请确保 backend/third_party/workbuddy/wb_proxy.py 存在。')
  }

  /** 查找可用的 Python 解释器 */
  private findPython(pythonPath?: string): string {
    if (pythonPath) return pythonPath
    const candidates = ['python3', 'python', 'py']
    for (const name of candidates) {
      try {
        const result = require('child_process').spawnSync(name, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'])
        if (result.status === 0) return name
      } catch {
        // try next
      }
    }
    return 'python3' // 兜底
  }

  /** 启动一个 workbuddy 子服务实例 */
  async ensureStarted(
    key: string,
    opts: { realm?: string; pythonPath?: string; apiKey?: string } = {}
  ): Promise<{ port: number; baseUrl: string }> {
    const existing = this.procs.get(key)
    if (existing && existing.child.exitCode === null && existing.ready) {
      return { port: existing.port, baseUrl: `http://127.0.0.1:${existing.port}` }
    }

    const wbDir = this.findWbScriptDir()
    const python = this.findPython(opts.pythonPath)
    const port = this.allocatePort()
    const scriptPath = path.join(wbDir, WB_SCRIPT_NAME)

    const args = [scriptPath, '--port', String(port), '--lan']
    if (opts.apiKey) {
      args.push('--api-key', opts.apiKey)
    }

    console.log(`[WorkBuddy] 启动子服务: ${python} ${args.join(' ')} (cwd: ${wbDir})`)

    const child = spawn(python, args, {
      cwd: wbDir,
      env: {
        ...process.env,
        WB_PROXY_DEFAULT_REALM: opts.realm || process.env.WB_PROXY_DEFAULT_REALM || 'intl',
        // 持久化账号数据到项目根目录的 .workbuddy_data
        WB_DATA_DIR: path.join(process.cwd(), '.workbuddy_data'),
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim()
      if (text) {
        // 只打印关键行（可改为 debug 级别）
        if (/error|Error|ERROR|listening|started|ready|API_KEY/i.test(text)) {
          console.log(`[WorkBuddy] ${text}`)
        }
      }
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim()
      if (text) {
        console.error(`[WorkBuddy stderr] ${text}`)
      }
    })

    child.on('exit', (code, signal) => {
      console.warn(`[WorkBuddy] 子服务退出: code=${code}, signal=${signal}`)
      const entry = this.procs.get(key)
      if (entry) {
        entry.ready = false
      }
    })

    child.on('error', (err) => {
      console.error(`[WorkBuddy] 子服务错误: ${err.message}`)
      const entry = this.procs.get(key)
      if (entry?.rejectHealthPromise) {
        entry.rejectHealthPromise(new Error(`Python 启动失败: ${err.message}`))
      }
    })

    const info: WorkbuddyProcessInfo = {
      child,
      port,
      startedAt: Date.now(),
      ready: false,
      rejectHealthPromise: null,
    }
    this.procs.set(key, info)

    // 健康检查循环
    await this.waitUntilHealthy(port, WB_STARTUP_TIMEOUT_MS)
    info.ready = true

    return { port, baseUrl: `http://127.0.0.1:${port}` }
  }

  private allocatePort(): number {
    // 简单递增，实际应该检查端口占用；workbuddy 自己如果端口被占会报错
    const used = new Set(Array.from(this.procs.values()).map(p => p.port))
    let port = this.nextPort
    while (used.has(port)) {
      port++
    }
    this.nextPort = port + 1
    return port
  }

  private async waitUntilHealthy(port: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    const healthUrl = `http://127.0.0.1:${port}/health`

    while (Date.now() < deadline) {
      try {
        const resp = await axios.get(healthUrl, {
          timeout: WB_HEALTH_CHECK_TIMEOUT_MS,
          validateStatus: () => true,
        })
        if (resp.status < 500) {
          console.log(`[WorkBuddy] 子服务就绪 (port ${port})`)
          return
        }
      } catch {
        // 未就绪，继续等
      }
      await new Promise(r => setTimeout(r, WB_HEALTH_CHECK_INTERVAL_MS))
    }
    throw new Error(`WorkBuddy 子服务在 ${timeoutMs}ms 内未就绪 (port ${port})`)
  }

  /** 停止指定 key 的子进程 */
  stop(key: string): void {
    const info = this.procs.get(key)
    if (info) {
      console.log(`[WorkBuddy] 停止子服务 (port ${info.port})`)
      try {
        info.child.kill('SIGTERM')
      } catch { /* ignore */ }
      this.procs.delete(key)
    }
  }

  /** 停止所有 */
  stopAll(): void {
    for (const key of Array.from(this.procs.keys())) {
      this.stop(key)
    }
  }

  /** 检查某个 key 是否健康 */
  isHealthy(key: string): boolean {
    const info = this.procs.get(key)
    return !!info && info.ready && info.child.exitCode === null
  }
}

// --- WorkBuddy Adapter 主体 ---

export interface ChatCompletionRequest {
  model: string
  originalModel?: string
  messages: any[]
  stream?: boolean
  temperature?: number
  tools?: any[]
  tool_choice?: any
  [key: string]: any
}

export class WorkbuddyAdapter {
  private provider: Provider
  private account: Account
  private processManager = WorkbuddyProcessManager.getInstance()

  constructor(provider: Provider, account: Account) {
    this.provider = provider
    this.account = account
  }

  static isWorkbuddyProvider(provider: Provider): boolean {
    return provider.id === 'workbuddy' || provider.apiEndpoint?.includes('18788')
  }

  /** 启动或获取子进程（公开给 OAuth 方法） */
  async getOrStartWbSubprocess(
    opts: { realm?: string; pythonPath?: string; apiKey?: string }
  ): Promise<{ port: number; baseUrl: string }> {
    return this.processManager.ensureStarted(this.getProcessKey(), opts);
  }

  private getProcessKey(): string {
    // 同一 account 使用同一子服务（workbuddy 子服务管理自己的账号池）
    return `wb-${this.account.id}`
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<{
    response: AxiosResponse
    conversationId: string
  }> {
    const c = this.account.credentials as any
    const { baseUrl } = await this.processManager.ensureStarted(this.getProcessKey(), {
      realm: c.realm,
      pythonPath: c.pythonPath,
      apiKey: c.apiKey,
    })

    const url = `${baseUrl}/v1/chat/completions`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': request.stream ? 'text/event-stream' : 'application/json',
    }
    if (c.apiKey) {
      headers['Authorization'] = `Bearer ${c.apiKey}`
    }

    // 构造转发请求体
    const body: any = {
      model: request.model,
      messages: request.messages,
      stream: request.stream || false,
    }
    if (request.temperature !== undefined) body.temperature = request.temperature
    if (request.top_p !== undefined) body.top_p = request.top_p
    if (request.max_tokens !== undefined) body.max_tokens = request.max_tokens
    if (request.tools !== undefined) body.tools = request.tools
    if (request.tool_choice !== undefined) body.tool_choice = request.tool_choice
    if (request.reasoning_effort !== undefined) body.reasoning_effort = request.reasoning_effort

    const response = await axios.post(url, body, {
      headers,
      timeout: 600000, // workbuddy 可能很慢
      responseType: request.stream ? 'stream' : 'json',
      validateStatus: () => true,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })

    return {
      response,
      conversationId: '', // workbuddy 无显式会话 ID
    }
  }

  async startLogin(realm?: string, platform?: string): Promise<any> {
    const c = this.account.credentials as any;
    const { baseUrl } = await this.getOrStartWbSubprocess({ realm: realm || c.realm, pythonPath: c.pythonPath, apiKey: c.apiKey });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (c.apiKey) headers['Authorization'] = `Bearer ${c.apiKey}`;
    const res = await axios.post(`${baseUrl}/accounts/login/start`, { realm: realm || c.realm || 'intl', platform: platform || 'Web' }, { headers, timeout: 30000 });
    return res.data;
  }
  async pollLogin(state: string): Promise<any> {
    const c = this.account.credentials as any;
    const { baseUrl } = await this.getOrStartWbSubprocess({ realm: c.realm, pythonPath: c.pythonPath, apiKey: c.apiKey });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (c.apiKey) headers['Authorization'] = `Bearer ${c.apiKey}`;
    const res = await axios.post(`${baseUrl}/accounts/login/poll`, { state }, { headers, timeout: 30000 });
    return res.data;
  }
  async cancelLogin(state: string): Promise<any> {
    const c = this.account.credentials as any;
    const { baseUrl } = await this.getOrStartWbSubprocess({ realm: c.realm, pythonPath: c.pythonPath, apiKey: c.apiKey });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (c.apiKey) headers['Authorization'] = `Bearer ${c.apiKey}`;
    const res = await axios.post(`${baseUrl}/accounts/login/cancel`, { state }, { headers, timeout: 30000 });
    return res.data;
  }
  async getHealth(): Promise<{ healthy: boolean; baseUrl: string; dashboardUrl: string }> {
    const c = this.account.credentials as any;
    const { baseUrl } = await this.getOrStartWbSubprocess({ realm: c.realm, pythonPath: c.pythonPath, apiKey: c.apiKey });
    try { await axios.get(`${baseUrl}/health`, { timeout: 5000 }); return { healthy: true, baseUrl, dashboardUrl: baseUrl }; }
    catch { return { healthy: false, baseUrl, dashboardUrl: baseUrl }; }
  }
}

// 进程清理：Node 退出时 stopAll
process.on('exit', () => {
  WorkbuddyProcessManager.getInstance().stopAll()
})
process.on('SIGTERM', () => {
  WorkbuddyProcessManager.getInstance().stopAll()
})

export const workbuddyAdapter = { WorkbuddyAdapter }
export default workbuddyAdapter

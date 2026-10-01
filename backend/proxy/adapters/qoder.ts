/**
 * Qoder CLI Adapter
 * 
 * 通过调用 qoderclicn / qodercli 命令行工具实现聊天请求。
 * 移植自 https://github.com/avaritiachaos/qoder-proxy
 * 
 * 支持：
 * - 非流式：CLI --output-format json
 * - 流式：CLI --output-format stream-json（增量 SSE 转发）
 * - 工具调用：通过 Prompt 注入格式指令 + 输出解析
 * - 推理强度别名：qwen3.8-max-effort-low/medium/high/max
 */

import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { PassThrough } from 'stream'
import { Account, Provider } from '../../store/types'
import { parseToolCallsFromText } from '../utils/toolParser'
import { createBaseChunk } from '../utils/streamToolHandler'

const DEFAULT_TIMEOUT_MS = 600000 // 10 分钟（推理 + 排队可能很慢）
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024

// --- 类型 ---

export interface QoderCredential {
  backend: 'cn' | 'global'
  token?: string
  cliCommand?: string
}

export interface QoderCliBackend {
  name: 'cn' | 'global'
  command: string
  homeDir: string
  tokenEnvVar: string
}

export interface ChatCompletionRequest {
  model: string
  originalModel?: string
  messages: QoderMessage[]
  stream?: boolean
  temperature?: number
  reasoning_effort?: string
  max_tokens?: number
  tools?: any[]
}

export interface QoderMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | any[] | null
  tool_call_id?: string
  tool_calls?: any[]
}

interface ModelRoute {
  baseModelId: string
  cliModel: string
  reasoningEffort?: string
}

// --- 模型注册表（对齐 qodercli --list-models） ---

const MODELS: Record<string, { cliModel: string; reasoning: boolean; effortAlias?: boolean }> = {
  'qoder-cn': { cliModel: 'auto', reasoning: true },
  'auto': { cliModel: 'auto', reasoning: true },
  'ultimate': { cliModel: 'Ultimate', reasoning: true },
  'performance': { cliModel: 'Performance', reasoning: true },
  'efficient': { cliModel: 'Efficient', reasoning: true },
  'lite': { cliModel: 'Lite', reasoning: true },
  'cantus': { cliModel: 'Cantus', reasoning: true },
  'qwen3.8-max': { cliModel: 'Qwen3.8-Max', reasoning: true },
  'qwen3.8-flash': { cliModel: 'Qwen3.8-Flash', reasoning: true },
  'qwen3.7-max': { cliModel: 'Qwen3.7-Max', reasoning: true },
  'qwen3.7-plus': { cliModel: 'Qwen3.7-Plus', reasoning: true },
  'kimi-k3': { cliModel: 'Kimi-K3', reasoning: true },
  'kimi-k2.7-code': { cliModel: 'Kimi-K2.7-Code', reasoning: true },
  'glm-5.3': { cliModel: 'GLM-5.3', reasoning: true },
  'glm-5.3-flash': { cliModel: 'GLM-5.3-Flash', reasoning: true },
  'deepseek-v4-pro': { cliModel: 'DeepSeek-V4-Pro', reasoning: true },
  'deepseek-v4-flash': { cliModel: 'DeepSeek-V4-Flash', reasoning: true },
  'minimax-m3': { cliModel: 'MiniMax-M3', reasoning: true },
}

const EFFORT_SUFFIX_RE = /^(.*)-effort-(low|medium|high|max)$/

// --- 工具函数 ---

function getCliBackend(cred: QoderCredential): QoderCliBackend {
  if (cred.backend === 'global') {
    return {
      name: 'global',
      command: cred.cliCommand || 'qodercli',
      homeDir: path.join(process.env.USERPROFILE || process.env.HOME || '~', '.qoder'),
      tokenEnvVar: 'QODER_PAT',
    }
  }
  return {
    name: 'cn',
    command: cred.cliCommand || 'qoderclicn',
    homeDir: path.join(process.env.USERPROFILE || process.env.HOME || '~', '.qoderworkcn'),
    tokenEnvVar: 'QODERCN_PERSONAL_ACCESS_TOKEN',
  }
}

function normalizeContent(content: any): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') return part.text || part.content || ''
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return String(content)
}

function isSystemRole(role: string): boolean {
  return role === 'system' || role === 'developer'
}

function normalizeMessages(messages: QoderMessage[]): QoderMessage[] {
  return messages.map((message) => {
    if (message.role === 'tool') {
      const id = message.tool_call_id || 'unknown'
      const content = normalizeContent(message.content)
      return {
        role: 'user',
        content: `<tool_result id="${id}">\n${content}\n</tool_result>`,
      } as QoderMessage
    }
    if (message.role === 'assistant' && message.tool_calls) {
      const parts: string[] = []
      if (message.content) {
        parts.push(normalizeContent(message.content))
      }
      for (const call of message.tool_calls) {
        const name = call.function?.name || call.name || 'unknown'
        const args = call.function?.arguments || JSON.stringify(call.arguments || {})
        parts.push(`[assistant called tool: ${name} with arguments: ${args}]`)
      }
      return { role: 'assistant', content: parts.join('\n') } as QoderMessage
    }
    return {
      role: message.role,
      content: normalizeContent(message.content),
    }
  })
}

function resolveModelRoute(modelId: string): ModelRoute {
  const match = modelId ? String(modelId).match(EFFORT_SUFFIX_RE) : null
  const baseModelId = match ? match[1] : modelId
  const model = MODELS[baseModelId]
  return {
    baseModelId,
    cliModel: model?.cliModel || baseModelId,
    reasoningEffort: match?.[2],
  }
}

/** 精简版工具系统 prompt（Qoder 版） */
function buildToolSystemPrompt(tools: any[]): string {
  const toolList = tools.map((t) => {
    const name = t.function?.name || t.name
    const desc = t.function?.description || t.description || ''
    const params = t.function?.parameters || t.parameters || {}
    return `- ${name}: ${desc}\n  Parameters: ${JSON.stringify(params)}`
  }).join('\n')

  return `You have access to the following tools. When you need to use a tool, respond ONLY with a JSON object (no other text, no code fences) in this exact format:
{"tool_calls":[{"name":"tool_name","arguments":{"key":"value"}}]}

Available tools:
${toolList}

When you have a final answer to the user, respond normally with plain text. Do NOT wrap tool calls in markdown code fences.`
}

function buildPrompt(messages: QoderMessage[], tools?: any[], hasSystemToolPrompt = false): string {
  const normalized = normalizeMessages(messages)
  const parts: string[] = []
  const hasSystemPrompt = normalized.some((m) => m.role === 'system')
  const hasTools = tools && tools.length > 0 && !hasSystemToolPrompt

  if (hasTools) {
    parts.push(buildToolSystemPrompt(tools))
  } else if (!hasSystemPrompt) {
    parts.push('Answer the latest user message in the conversation context below.')
  }
  parts.push('')
  parts.push(JSON.stringify({ messages: normalized }, null, 2))
  return parts.join('\n')
}

// --- CLI spawn 辅助 ---

function ensureRuntimeHome(rootDir: string): string {
  const runtimeHome = path.join(rootDir, '.runtime', 'qoder-home')
  fs.mkdirSync(path.join(runtimeHome, 'AppData', 'Roaming'), { recursive: true })
  fs.mkdirSync(path.join(runtimeHome, 'AppData', 'Local'), { recursive: true })
  return runtimeHome
}

function createPromptAttachment(rootDir: string, prompt: string): string {
  const promptDir = path.join(rootDir, '.runtime', 'prompts')
  fs.mkdirSync(promptDir, { recursive: true })
  const filePath = path.join(
    promptDir,
    `prompt-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`
  )
  fs.writeFileSync(filePath, prompt, 'utf8')
  return filePath
}

function buildChildEnv(rootDir: string, token: string | undefined, backend: QoderCliBackend): NodeJS.ProcessEnv {
  ensureRuntimeHome(rootDir)
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (token) {
    env[backend.tokenEnvVar] = token
  }
  return env
}

function buildCliArgs(opts: {
  cliModel: string
  attachmentPath: string
  appendSystemPrompt?: string
  reasoningEffort?: string
  maxOutputTokens?: number
  stream?: boolean
}): string[] {
  const args = [
    '--print',
    '--output-format',
    opts.stream ? 'stream-json' : 'json',
    '--model',
    opts.cliModel,
    '--dangerously-skip-permissions',
  ]
  // 默认禁用 CLI 内置工具（让它不跑文件/shell 代理循环）
  if (!process.env.QODERCN_CLI_TOOLS) {
    args.push('--tools=')
  }
  args.push('--attachment', opts.attachmentPath)
  if (opts.appendSystemPrompt) {
    args.push('--append-system-prompt', opts.appendSystemPrompt)
  }
  if (opts.reasoningEffort) {
    args.push('--reasoning-effort', opts.reasoningEffort)
  }
  if (opts.maxOutputTokens) {
    args.push('--max-output-tokens', String(opts.maxOutputTokens))
  }
  // attachment 指令（CLI 需要 -- 之后的指令）
  args.push('--', 'Answer the attached request and return only the final assistant message content.')
  return args
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}

function textFromContentParts(content: any): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part: any) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object') return part.text || part.content || ''
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function extractText(record: any): string {
  if (record == null) return ''
  if (typeof record === 'string') return record
  if (Array.isArray(record)) {
    for (let i = record.length - 1; i >= 0; i--) {
      const text = extractText(record[i])
      if (text) return text
    }
    return ''
  }
  if (typeof record !== 'object') return ''
  if (record.type === 'result' && typeof record.result === 'string') return record.result
  if (typeof record.content === 'string') return record.content
  if (typeof record.text === 'string') return record.text
  if (typeof record.result === 'string') return record.result
  if (typeof record.response === 'string') return record.response
  if (typeof record.output === 'string') return record.output
  const message = record.message
  if (typeof message === 'string') return message
  if (message && typeof message === 'object') {
    const fromContent = textFromContentParts(message.content)
    if (fromContent) return fromContent
    if (typeof message.text === 'string') return message.text
  }
  return ''
}

function parseMaybeJsonLines(text: string): any[] {
  const trimmed = stripAnsi(text).trim()
  if (!trimmed) return []
  try {
    return [JSON.parse(trimmed)]
  } catch {
    const parsed: any[] = []
    for (const line of trimmed.split(/\r?\n/)) {
      const candidate = line.trim()
      if (!candidate || (!candidate.startsWith('{') && !candidate.startsWith('['))) continue
      try {
        parsed.push(JSON.parse(candidate))
      } catch {
        // skip
      }
    }
    return parsed
  }
}

function extractAssistantContent(stdout: string): string {
  const records = parseMaybeJsonLines(stdout)
  if (!records.length) {
    throw new Error('Qoder CLI did not return structured JSON output.')
  }
  for (let i = records.length - 1; i >= 0; i--) {
    const text = extractText(records[i]).trim()
    if (text) return text
  }
  throw new Error('Qoder CLI returned no assistant content.')
}

// --- 流式快照跟踪 ---

interface StreamSnapshotTracker {
  push(record: any): string[]
}

function createStreamSnapshotTracker(): StreamSnapshotTracker {
  let lastMessageId: string | null = null
  let blockLengths: number[] = []

  return {
    push(record: any): string[] {
      if (!record || typeof record !== 'object' || record.type !== 'assistant') return []
      const messageId = record.message?.id || null
      if (messageId !== lastMessageId) {
        lastMessageId = messageId
        blockLengths = []
      }
      if (record.message && Array.isArray(record.message.content)) {
        const texts: string[] = record.message.content
          .filter((b: any) => b && b.type === 'text' && typeof b.text === 'string')
          .map((b: any) => b.text)
        if (texts.length) {
          if (texts.length < blockLengths.length) blockLengths = []
          const deltas: string[] = []
          texts.forEach((text, index) => {
            const previous = blockLengths[index] || 0
            blockLengths[index] = text.length
            if (text.length > previous) deltas.push(text.slice(previous))
          })
          return deltas
        }
      }
      return []
    },
  }
}

// --- Qoder Adapter 主体 ---

export class QoderAdapter {
  private provider: Provider
  private account: Account
  private cred: QoderCredential

  constructor(provider: Provider, account: Account) {
    this.provider = provider
    this.account = account
    const c = account.credentials as any
    this.cred = {
      backend: (c.backend || 'cn') as 'cn' | 'global',
      token: c.token || c.pat || process.env.QODERCN_PERSONAL_ACCESS_TOKEN,
      cliCommand: c.cliCommand,
    }
  }

  static isQoderProvider(provider: Provider): boolean {
    return provider.id === 'qoder' || provider.apiEndpoint?.includes('cli://') || provider.apiEndpoint?.includes('qoder')
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<{
    response: { data: any; status: number }
    stream: NodeJS.ReadableStream | null
  }> {
    const backend = getCliBackend(this.cred)
    const token = this.cred.token

    // 认证检查
    if (backend.name === 'cn' && !token) {
      throw new Error(`Qoder CN 需要 Personal Access Token。请在账号凭证中填写 token 字段或设置 ${backend.tokenEnvVar} 环境变量。`)
    }

    const systemMessages = request.messages.filter((m) => isSystemRole(m.role))
    const nonSystemMessages = request.messages.filter((m) => !isSystemRole(m.role))
    const appendSystemPrompt = systemMessages
      .map((m) => normalizeContent(m.content))
      .filter(Boolean)
      .join('\n\n')

    const hasSystemToolPrompt = systemMessages.some((m) => /\[Tool Protocol\]/.test(normalizeContent(m.content)))
    const modelRoute = resolveModelRoute(request.model)
    const prompt = buildPrompt(nonSystemMessages, request.tools, hasSystemToolPrompt)

    const timeoutMs = Number(process.env.QODER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
    const effort = request.reasoning_effort || modelRoute.reasoningEffort
    const outputTokens = request.max_tokens

    const rootDir = process.cwd()
    const attachmentPath = createPromptAttachment(rootDir, prompt)
    const args = buildCliArgs({
      cliModel: modelRoute.cliModel,
      attachmentPath,
      appendSystemPrompt: appendSystemPrompt || undefined,
      reasoningEffort: effort,
      maxOutputTokens: outputTokens,
      stream: request.stream,
    })

    const childEnv = buildChildEnv(rootDir, token, backend)

    if (request.stream) {
      return this.runStream(backend, attachmentPath, args, childEnv, timeoutMs, request.model, rootDir)
    } else {
      return this.runNonStream(backend, attachmentPath, args, childEnv, timeoutMs)
    }
  }

  /** 非流式：等 CLI 结束，提取完整输出，返回结构化 JSON */
  private runNonStream(
    backend: QoderCliBackend,
    attachmentPath: string,
    args: string[],
    childEnv: NodeJS.ProcessEnv,
    timeoutMs: number
  ): Promise<{ response: { data: any; status: number }; stream: null }> {
    return new Promise((resolve, reject) => {
      let stdoutBytes = 0
      let stderrBytes = 0
      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      let settled = false
      let timedOut = false
      let forceSettleTimer: NodeJS.Timeout | null = null

      const finish = (fn: Function, value: any) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        clearTimeout(forceSettleTimer!)
        fs.rmSync(attachmentPath, { force: true })
        fn(value)
      }

      const timer = setTimeout(() => {
        timedOut = true
        child.kill()
        forceSettleTimer = setTimeout(() => {
          finish(reject, new Error(`${backend.command} request timed out.`))
        }, 5000)
      }, timeoutMs)

      const child: ChildProcess = spawn(backend.command, args, {
        cwd: process.cwd(),
        env: childEnv,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      child.on('error', (error) => {
        const e = error as NodeJS.ErrnoException
        const msg = e.code === 'ENOENT'
          ? `${backend.command} 未安装或不在 PATH 中。请运行: npm install -g ${backend.name === 'global' ? '@qoder-ai/qodercli' : '@qodercn-ai/qoderclicn'}`
          : `启动 ${backend.command} 失败: ${error.message}`
        finish(reject, new Error(msg))
      })

      child.stdout!.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.length
        if (stdoutBytes > MAX_OUTPUT_BYTES) {
          child.kill()
          finish(reject, new Error('CLI output exceeded 10MB limit'))
          return
        }
        stdoutChunks.push(chunk)
      })

      child.stderr!.on('data', (chunk: Buffer) => {
        stderrBytes += chunk.length
        if (stderrBytes > MAX_OUTPUT_BYTES) {
          child.kill()
          finish(reject, new Error('CLI stderr exceeded 10MB limit'))
          return
        }
        stderrChunks.push(chunk)
      })

      child.on('close', (code) => {
        if (settled) return
        if (timedOut) return
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString('utf8')
          finish(reject, new Error(`${backend.command} exited with code ${code}: ${stderr.slice(0, 300)}`))
          return
        }
        try {
          const stdout = Buffer.concat(stdoutChunks).toString('utf8')
          const content = extractAssistantContent(stdout)
          finish(resolve, {
            response: {
              status: 200,
              data: this.wrapCompletion(content, 'qoder'),
            },
            stream: null,
          })
        } catch (e) {
          finish(reject, e)
        }
      })
    })
  }

  /** 流式：实时解析 stream-json，转发 SSE */
  private runStream(
    backend: QoderCliBackend,
    attachmentPath: string,
    args: string[],
    childEnv: NodeJS.ProcessEnv,
    timeoutMs: number,
    model: string,
    rootDir: string
  ): Promise<{ response: { data: any; status: number }; stream: NodeJS.ReadableStream }> {
    return new Promise((resolve, reject) => {
      const transStream = new PassThrough()
      let stdoutBytes = 0
      let stderrBytes = 0
      const stderrChunks: Buffer[] = []
      let settled = false
      let timedOut = false
      let forceSettleTimer: NodeJS.Timeout | null = null
      let exitFallbackTimer: NodeJS.Timeout | null = null
      let lineBuffer = ''
      const fullTextParts: string[] = []
      const parsedRecords: any[] = []
      const snapshotTracker = createStreamSnapshotTracker()
      const created = Math.floor(Date.now() / 1000)
      let sentRole = false

      const finish = (fn: Function, value: any) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        clearTimeout(forceSettleTimer!)
        clearTimeout(exitFallbackTimer!)
        fs.rmSync(attachmentPath, { force: true })
        fn(value)
      }

      const timer = setTimeout(() => {
        timedOut = true
        child.kill()
        forceSettleTimer = setTimeout(() => {
          if (!transStream.closed) transStream.end('data: [DONE]\n\n')
          finish(reject, new Error(`${backend.command} stream request timed out.`))
        }, 5000)
      }, timeoutMs)

      const sendRoleOnce = () => {
        if (!sentRole) {
          transStream.write(`data: ${JSON.stringify({
            id: `qoder-${Date.now()}`,
            model,
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
            created,
          })}\n\n`)
          sentRole = true
        }
      }

      const child: ChildProcess = spawn(backend.command, args, {
        cwd: rootDir,
        env: childEnv,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      child.on('error', (error) => {
        const e = error as NodeJS.ErrnoException
        const msg = e.code === 'ENOENT'
          ? `${backend.command} 未安装或不在 PATH 中。请运行: npm install -g ${backend.name === 'global' ? '@qoder-ai/qodercli' : '@qodercn-ai/qoderclicn'}`
          : `启动 ${backend.command} 失败: ${error.message}`
        if (!transStream.closed) {
          transStream.write(`data: ${JSON.stringify({
            id: 'qoder-error',
            model,
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: { content: `Error: ${msg}` }, finish_reason: 'error' }],
            created,
          })}\n\n`)
          transStream.end('data: [DONE]\n\n')
        }
        finish(reject, new Error(msg))
      })

      child.stdout!.on('data', (chunk: Buffer) => {
        try {
          stdoutBytes += chunk.length
          if (stdoutBytes > MAX_OUTPUT_BYTES) {
            throw new Error('CLI output exceeded 10MB limit')
          }
        } catch (e) {
          child.kill()
          if (!transStream.closed) {
            transStream.write(`data: ${JSON.stringify({
              id: 'qoder-error',
              model,
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: { content: `Error: ${(e as Error).message}` }, finish_reason: 'error' }],
              created,
            })}\n\n`)
            transStream.end('data: [DONE]\n\n')
          }
          finish(reject, e)
          return
        }

        lineBuffer += chunk.toString('utf8')
        const lines = lineBuffer.split(/\r?\n/)
        lineBuffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const record = JSON.parse(trimmed)
            parsedRecords.push(record)
            for (const delta of snapshotTracker.push(record)) {
              fullTextParts.push(delta)
              sendRoleOnce()
              transStream.write(`data: ${JSON.stringify({
                id: `qoder-${Date.now()}`,
                model,
                object: 'chat.completion.chunk',
                choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
                created,
              })}\n\n`)
            }
          } catch {
            // 非 JSON 行：跳过
          }
        }
      })

      child.stderr!.on('data', (chunk: Buffer) => {
        stderrBytes += chunk.length
        if (stderrBytes > MAX_OUTPUT_BYTES) {
          child.kill()
          finish(reject, new Error('CLI stderr exceeded 10MB limit'))
          return
        }
        stderrChunks.push(chunk)
      })

      const handleClose = (code: number | null) => {
        // flush 剩余 buffer
        if (lineBuffer.trim()) {
          try {
            const record = JSON.parse(lineBuffer.trim())
            parsedRecords.push(record)
            for (const delta of snapshotTracker.push(record)) {
              fullTextParts.push(delta)
              sendRoleOnce()
              transStream.write(`data: ${JSON.stringify({
                id: `qoder-${Date.now()}`,
                model,
                object: 'chat.completion.chunk',
                choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
                created,
              })}\n\n`)
            }
          } catch { /* ignore */ }
        }

        if (settled) return
        if (timedOut) {
          if (!transStream.closed) transStream.end('data: [DONE]\n\n')
          return
        }
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString('utf8')
          if (!transStream.closed) {
            transStream.write(`data: ${JSON.stringify({
              id: 'qoder-error',
              model,
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: { content: `CLI exited with code ${code}: ${stderr.slice(0, 200)}` }, finish_reason: 'error' }],
              created,
            })}\n\n`)
            transStream.end('data: [DONE]\n\n')
          }
          finish(reject, new Error(`${backend.command} exited with code ${code}`))
          return
        }

        // fallback：没识别到 assistant delta 但 CLI 正常退出，尝试从最后一条记录提取
        if (!fullTextParts.length && parsedRecords.length) {
          for (let i = parsedRecords.length - 1; i >= 0; i--) {
            const text = extractText(parsedRecords[i]).trim()
            if (text) {
              fullTextParts.push(text)
              sendRoleOnce()
              transStream.write(`data: ${JSON.stringify({
                id: `qoder-${Date.now()}`,
                model,
                object: 'chat.completion.chunk',
                choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
                created,
              })}\n\n`)
              break
            }
          }
        }

        if (!transStream.closed) {
          // 检查是否有工具调用
          const fullText = fullTextParts.join('')
          const { toolCalls } = parseToolCallsFromText(fullText, 'qoder')
          if (toolCalls.length > 0) {
            transStream.write(`data: ${JSON.stringify({
              id: `qoder-${Date.now()}`,
              model,
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: { tool_calls: toolCalls }, finish_reason: null }],
              created,
            })}\n\n`)
            transStream.write(`data: ${JSON.stringify({
              id: `qoder-${Date.now()}`,
              model,
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
              created,
            })}\n\n`)
          } else {
            transStream.write(`data: ${JSON.stringify({
              id: `qoder-${Date.now()}`,
              model,
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              created,
            })}\n\n`)
          }
          transStream.end('data: [DONE]\n\n')
        }

        finish(resolve, {
          response: { status: 200, data: null },
          stream: transStream,
        })
      }

      child.on('exit', (code) => {
        exitFallbackTimer = setTimeout(() => handleClose(code), 2000)
      })

      child.on('close', (code) => {
        clearTimeout(exitFallbackTimer!)
        handleClose(code)
      })
    })
  }

  /** 把纯文本包装成 OpenAI 兼容的 completion 对象 */
  private wrapCompletion(content: string, model: string): any {
    const { content: cleanContent, toolCalls } = parseToolCallsFromText(content, 'qoder')
    const message: any = {
      role: 'assistant',
      content: toolCalls.length > 0 ? null : cleanContent.trim(),
    }
    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls
    }
    return {
      id: `qoder-${Date.now()}`,
      model,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      choices: [{
        index: 0,
        message,
        finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }
  }
}

export const qoderAdapter = { QoderAdapter }
export default qoderAdapter

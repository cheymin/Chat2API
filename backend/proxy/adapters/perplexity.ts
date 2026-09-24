import * as https from 'https'
import * as http from 'http'
import * as net from 'net'
import { Readable } from 'stream'
import { Account, Provider } from '../../store/types'
import { ConfigManager } from '../../store/config'

const PERPLEXITY_URL = 'https://www.perplexity.ai'
const QUERY_ENDPOINT = `${PERPLEXITY_URL}/rest/sse/perplexity_ask`

/**
 * Build an https.Agent that tunnels through an HTTP CONNECT proxy if configured.
 * Falls back to the default agent when no proxy is set.
 */
function buildProxyAgent(proxyUrl: string): https.Agent | undefined {
  if (!proxyUrl) return undefined
  try {
    const proxy = new URL(proxyUrl)
    const proxyHost = proxy.hostname
    const proxyPort = parseInt(proxy.port, 10) || 8080
    // Use HTTP CONNECT tunneling for HTTPS targets
    const agent = new https.Agent()
      // Override createConnection to proxy through HTTP CONNECT
      ; (agent as any).createConnection = (options: any, callback: any) => {
        const targetHost = options.hostname || options.host
        const targetPort = options.port || 443

        const socket = net.createConnection(proxyPort, proxyHost, () => {
          const connectReq = [
            `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
            `Host: ${targetHost}:${targetPort}`,
            'Connection: close',
            '',
            '',
          ].join('\r\n')
          socket.write(connectReq)

          let responseData = ''
          const onData = (chunk: Buffer) => {
            responseData += chunk.toString()
            if (responseData.includes('\r\n\r\n')) {
              socket.removeListener('data', onData)

              const statusLine = responseData.split('\r\n')[0]
              if (!statusLine.includes(' 200')) {
                socket.destroy(new Error(`Proxy CONNECT failed: ${statusLine}`))
                return
              }

              // Upgrade to TLS
              const tlsSocket = (require('tls') as typeof import('tls')).connect({
                socket,
                host: targetHost,
                servername: targetHost,
                rejectUnauthorized: false,
              })
              callback(null, tlsSocket)
            }
          }
          socket.on('data', onData)
        })
        socket.on('error', callback)

        // Return undefined so the HTTPS module waits for the callback
        // instead of immediately writing HTTP data to the raw proxy socket.
        return undefined
      }
    return agent
  } catch (e) {
    console.error('[Perplexity] Invalid proxy URL, using direct connection:', proxyUrl, e)
    return undefined
  }
}

const FAKE_HEADERS: Record<string, string> = {
  'Accept': 'text/event-stream',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
  'Cache-Control': 'no-cache',
  'Origin': PERPLEXITY_URL,
  'Sec-Ch-Ua': '"Microsoft Edge";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
  'Sec-Ch-Ua-Arch': '"x86"',
  'Sec-Ch-Ua-Bitness': '"64"',
  'Sec-Ch-Ua-Full-Version': '"153.0.4234.48"',
  'Sec-Ch-Ua-Full-Version-List': '"Microsoft Edge";v="153.0.4234.48", "Not_A Brand";v="8.0.0.0", "Chromium";v="153.0.8010.53"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Model': '""',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Ch-Ua-Platform-Version': '"10.0.0"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0',
}

interface PerplexityMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null | any[]
  tool_call_id?: string
  tool_calls?: any[]
}

interface ChatCompletionRequest {
  model: string
  messages: PerplexityMessage[]
  stream?: boolean
  temperature?: number
  web_search?: boolean
  reasoning_effort?: 'low' | 'medium' | 'high'
  tools?: any[]
  tool_choice?: any
}

interface SessionData {
  backend_uuid: string
  read_write_token: string
  thread_url_slug: string
  frontend_context_uuid: string
  frontend_uuid: string
  createdAt: number
}

interface StoredCookies {
  [name: string]: string
}

const sessionCache = new Map<string, SessionData>()
const cookiesCache = new Map<string, StoredCookies>()

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function extractQuery(messages: PerplexityMessage[]): string {
  // First, extract system prompt if present
  let systemPrompt = ''
  for (const msg of messages) {
    if (msg.role === 'system') {
      const content = msg.content
      if (typeof content === 'string') {
        systemPrompt = content
      } else if (Array.isArray(content)) {
        const texts = content
          .filter((item: any) => item.type === 'text')
          .map((item: any) => item.text)
        systemPrompt = texts.join('\n')
      }
      break
    }
  }

  // Build conversation history from all non-system messages
  const conversationParts: string[] = []
  for (const msg of messages) {
    if (msg.role === 'system') continue

    let content = ''
    if (typeof msg.content === 'string') {
      content = msg.content
    } else if (Array.isArray(msg.content)) {
      const texts = msg.content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
      content = texts.join('\n')
    }

    if (content) {
      const roleLabel = msg.role === 'user' ? 'User' : 'Assistant'
      conversationParts.push(`[${roleLabel}]: ${content}`)
    }
  }

  const conversationHistory = conversationParts.join('\n\n')

  // Combine system prompt and conversation history
  if (systemPrompt && conversationHistory) {
    return `${systemPrompt}\n\n---\n\n${conversationHistory}`
  }

  return conversationHistory || systemPrompt
}

function mapModel(model: string): string {
  const directMappings: Record<string, string> = {
    'Auto': 'turbo',
    'Turbo': 'turbo',
    'PPLX-Pro': 'pplx_pro',
    'GPT-5': 'gpt5',
    'Gemini-2.5-Pro': 'gemini25pro',
    'Claude-Sonnet-4': 'claude4sonnet',
    'Claude-Opus-4': 'claude4opus',
    'Nemotron': 'nemotron',
  }

  if (directMappings[model]) {
    return directMappings[model]
  }

  const modelLower = model.toLowerCase()

  const legacyMappings: Record<string, string> = {
    'gpt-5': 'gpt5',
    'gemini-2.5-pro': 'gemini25pro',
    'claude-sonnet-4': 'claude4sonnet',
    'claude-opus-4': 'claude4opus',
    'nemotron': 'nemotron',
  }

  if (legacyMappings[modelLower]) {
    return legacyMappings[modelLower]
  }

  if (modelLower.includes('turbo')) return 'turbo'
  if (modelLower.includes('gpt5') || modelLower.includes('gpt-5')) return 'gpt5'
  if (modelLower.includes('pplx')) return 'pplx_pro'
  if (modelLower.includes('gemini')) return 'gemini25pro'
  if (modelLower.includes('claude')) {
    if (modelLower.includes('opus')) return 'claude4opus'
    if (modelLower.includes('sonnet')) return 'claude4sonnet'
    return 'claude4sonnet'
  }
  if (modelLower.includes('nemotron')) return 'nemotron'

  return 'turbo'
}

export class PerplexityAdapter {
  private provider: Provider
  private account: Account
  private cookie: string
  private allCookies: StoredCookies

  constructor(provider: Provider, account: Account) {
    this.provider = provider
    this.account = account
    this.cookie = account.credentials.sessionToken || account.credentials.cookie || account.credentials.token || ''
    // Store all cookies from credentials for Cloudflare-protected requests
    let parsedCookies: StoredCookies = {}
    if (typeof account.credentials.cookies === 'string') {
      try {
        parsedCookies = JSON.parse(account.credentials.cookies)
      } catch (e) {
        // ignore
      }
    } else if (account.credentials.cookies && typeof account.credentials.cookies === 'object') {
      parsedCookies = account.credentials.cookies as any
    }
    this.allCookies = parsedCookies
    // Ensure session token is in allCookies
    if (this.cookie && !this.allCookies['__Secure-next-auth.session-token']) {
      this.allCookies['__Secure-next-auth.session-token'] = this.cookie
    }
  }

  private buildCookieHeader(): string {
    const cookieParts: string[] = []
    for (const [name, value] of Object.entries(this.allCookies)) {
      cookieParts.push(`${name}=${value}`)
    }
    if (this.cookie && !this.allCookies['__Secure-next-auth.session-token']) {
      cookieParts.push(`__Secure-next-auth.session-token=${this.cookie}`)
    }
    return cookieParts.join('; ')
  }

  private formatNetworkError(error: Error): string {
    const errorMsg = error.message || String(error)

    if (errorMsg.includes('ERR_CONNECTION_RESET') || errorMsg.includes('net::ERR_CONNECTION_RESET')) {
      return 'Network connection reset. Please check your network connection and try again.'
    }
    if (errorMsg.includes('ERR_CONNECTION_REFUSED') || errorMsg.includes('net::ERR_CONNECTION_REFUSED')) {
      return 'Connection refused. The server may be temporarily unavailable.'
    }
    if (errorMsg.includes('ERR_CONNECTION_TIMED_OUT') || errorMsg.includes('net::ERR_CONNECTION_TIMED_OUT')) {
      return 'Connection timed out. Please check your network and try again.'
    }
    if (errorMsg.includes('ERR_SSL') || errorMsg.includes('SSL')) {
      return 'SSL/TLS handshake failed. Please check your network security settings.'
    }
    if (errorMsg.includes('ERR_NAME_NOT_RESOLVED') || errorMsg.includes('net::ERR_NAME_NOT_RESOLVED')) {
      return 'DNS resolution failed. Please check your network connection.'
    }
    if (errorMsg.includes('ERR_NETWORK_CHANGED') || errorMsg.includes('net::ERR_NETWORK_CHANGED')) {
      return 'Network changed during request. Please try again.'
    }
    if (errorMsg.includes('ERR_INTERNET_DISCONNECTED') || errorMsg.includes('net::ERR_INTERNET_DISCONNECTED')) {
      return 'No internet connection. Please check your network settings.'
    }

    return `Network error: ${errorMsg}. Please check your connection and try again.`
  }

  private buildRequestData(
    query: string,
    model: string
  ): any {
    const frontendUuid = uuid()
    const frontendContextUuid = uuid()
    const rumSessionId = uuid()

    const baseParams: any = {
      attachments: [],
      language: 'zh-CN',
      timezone: 'Asia/Shanghai',
      search_focus: 'internet',
      sources: ['web'],
      frontend_uuid: frontendUuid,
      mode: 'copilot',
      model_preference: model,
      is_related_query: false,
      is_sponsored: false,
      frontend_context_uuid: frontendContextUuid,
      prompt_source: 'user',
      query_source: 'home',
      is_incognito: false,
      time_from_first_type: Math.random() * 5000 + 1000,
      local_search_enabled: false,
      use_schematized_api: true,
      send_back_text_in_streaming_api: false,
      supported_block_use_cases: [
        'answer_modes',
        'media_items',
        'inline_entity_cards',
        'place_widgets',
        'finance_widgets',
        'sports_widgets',
        'news_widgets',
        'shopping_widgets',
        'jobs_widgets',
        'search_result_widgets',
        'inline_images',
        'inline_assets',
        'placeholder_cards',
        'diff_blocks',
        'entity_group_v2',
        'refinement_filters',
        'canvas_mode',
        'maps_preview',
        'answer_tabs',
        'price_comparison_widgets',
        'preserve_latex',
        'generic_onboarding_widgets',
        'in_context_suggestions',
        'pending_followups',
        'inline_claims',
        'unified_assets',
        'workflow_steps',
        'workflow_widgets',
        'navigation_results',
        'background_agents',
      ],
      client_coordinates: null,
      mentions: [],
      dsl_query: query,
      skip_search_enabled: true,
      is_nav_suggestions_disabled: false,
      source: 'default',
      always_search_override: false,
      override_no_search: false,
      client_search_results_cache_key: frontendUuid,
      should_ask_for_mcp_tool_confirmation: true,
      supports_tool_approval_modal: true,
      browser_agent_allow_once_from_toggle: false,
      force_enable_browser_agent: false,
      supported_features: ['browser_agent_permission_banner_v1.1'],
      extended_context: false,
      local_workspace_directories: [],
      version: '2.18',
      rum_session_id: rumSessionId,
    }

    return {
      params: baseParams,
      query_str: query
    }
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<{ stream: Readable; sessionId: string }> {
    const query = extractQuery(request.messages)
    if (!query) {
      throw new Error('No user message found in request')
    }

    const model = mapModel(request.model)
    const requestId = uuid()

    const referer = `${PERPLEXITY_URL}/`
    // Extract account UUID from credentials for x-pplx-account header
    const pplxAccount = this.account.credentials.pplx_account || ''

    const headers: Record<string, string> = {
      ...FAKE_HEADERS,
      'Content-Type': 'application/json',
      'Cookie': this.buildCookieHeader(),
      'Pragma': 'no-cache',
      'Priority': 'u=1, i',
      'Referer': referer,
      'x-perplexity-request-endpoint': QUERY_ENDPOINT,
      'x-perplexity-request-reason': 'ask-query-state-provider',
      'x-perplexity-request-try-number': '1',
      'x-request-id': requestId,
      ...(pplxAccount ? { 'x-pplx-account': pplxAccount } : {}),
    }

    const data = this.buildRequestData(query, model)

    // Use outbound proxy if configured
    const proxyUrl = ConfigManager.get().outboundProxy || ''
    const agent = buildProxyAgent(proxyUrl)

    const request_ = https.request(QUERY_ENDPOINT, {
      method: 'POST',
      agent,
    })

    for (const [key, value] of Object.entries(headers)) {
      request_.setHeader(key, value)
    }

    const stream = new Readable({
      read() { }
    })

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let errorBodyRead = false

      request_.on('response', (response) => {
        const statusCode = response.statusCode

        if (statusCode === 403) {
          // Cloudflare challenge - need to handle this
          stream.emit('error', new Error('Cloudflare challenge detected. Please try again later.'))
          reject(new Error('Cloudflare challenge detected'))
          return
        }

        if (statusCode === 429) {
          // Rate limit exceeded
          stream.emit('error', new Error('Rate limit exceeded. Please wait a moment and try again.'))
          reject(new Error('Rate limit exceeded'))
          return
        }

        if (statusCode && statusCode >= 400) {
          // Error response - read full body before rejecting
          errorBodyRead = true
          let errorBody = ''
          response.on('data', (chunk: Buffer) => {
            errorBody += chunk.toString()
          })
          response.on('end', () => {
            const errorMsg = `HTTP ${statusCode}: ${errorBody.substring(0, 200)}`
            console.error('[Perplexity] Server error:', errorMsg)
            stream.emit('error', new Error(errorMsg))
            reject(new Error(errorMsg))
          })
          response.on('error', (error) => {
            console.error('[Perplexity] Error response stream error:', error)
            const errorMsg = `HTTP ${statusCode}: Failed to read error response`
            stream.emit('error', new Error(errorMsg))
            reject(new Error(errorMsg))
          })
          return
        }

        // Success response - stream the data
        response.on('data', (chunk) => {
          console.log('[DEBUG PPLX Stream]', chunk.toString().slice(0, 200))
          stream.push(chunk)
          chunks.push(Buffer.from(chunk))
        })

        response.on('end', () => {
          stream.push(null)
        })

        response.on('error', (error) => {
          console.error('[Perplexity] Response error:', error)
          const errorMessage = this.formatNetworkError(error)
          stream.emit('error', new Error(errorMessage))
        })

        resolve({ stream, sessionId: requestId })
      })

      request_.on('error', (error) => {
        console.error('[Perplexity] Request error:', error)
        const errorMessage = this.formatNetworkError(error)
        const wrappedError = new Error(errorMessage)
        stream.emit('error', wrappedError)
        reject(wrappedError)
      })

      request_.write(JSON.stringify(data))
      request_.end()
    })
  }

  updateSessionData(data: Partial<SessionData>): void {
    const cacheKey = this.account.id
    const existing = sessionCache.get(cacheKey)

    const newData: SessionData = {
      backend_uuid: data.backend_uuid || existing?.backend_uuid || '',
      read_write_token: data.read_write_token || existing?.read_write_token || '',
      thread_url_slug: data.thread_url_slug || existing?.thread_url_slug || '',
      frontend_context_uuid: data.frontend_context_uuid || existing?.frontend_context_uuid || uuid(),
      frontend_uuid: data.frontend_uuid || existing?.frontend_uuid || uuid(),
      createdAt: existing?.createdAt || Date.now(),
    }

    sessionCache.set(cacheKey, newData)
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const cacheKey = this.account.id
    const sessionData = sessionCache.get(cacheKey)

    if (!sessionData?.backend_uuid) {
      sessionCache.delete(cacheKey)
      return true
    }

    try {
      const deleteUrl = `${PERPLEXITY_URL}/rest/thread/delete_thread_by_entry_uuid?version=2.18&source=default`

      // Extract account UUID from credentials
      const pplxAccount = this.account.credentials.pplx_account || ''
      const deleteRequestId = uuid()

      const headers: Record<string, string> = {
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Content-Type': 'application/json',
        'Cookie': this.buildCookieHeader(),
        'Origin': PERPLEXITY_URL,
        'Priority': 'u=1, i',
        'Referer': `${PERPLEXITY_URL}/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0',
        'sec-ch-ua': '"Microsoft Edge";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'x-app-apiclient': 'default',
        'x-app-apiversion': '2.18',
        'x-perplexity-request-endpoint': deleteUrl,
        'x-perplexity-request-reason': 'sidebar-v3',
        'x-perplexity-request-try-number': '1',
        'x-request-id': deleteRequestId,
        ...(pplxAccount ? { 'x-pplx-account': pplxAccount } : {}),
      }

      const requestBody = {
        entry_uuid: sessionData.backend_uuid,
        read_write_token: sessionData.read_write_token || '',
      }

      const payload = JSON.stringify(requestBody)
      headers['Content-Length'] = Buffer.byteLength(payload).toString()

      return new Promise((resolve) => {
        // Use outbound proxy if configured
        const proxyUrl = ConfigManager.get().outboundProxy || ''
        const agent = buildProxyAgent(proxyUrl)

        const request_ = https.request(deleteUrl, {
          method: 'DELETE',
          agent,
        })

        for (const [key, value] of Object.entries(headers)) {
          request_.setHeader(key, value)
        }

        request_.on('response', (response) => {
          const statusCode = response.statusCode

          // Read response body
          let responseBody = ''
          response.on('data', (chunk: Buffer) => {
            responseBody += chunk.toString()
          })

          if (statusCode && statusCode >= 200 && statusCode < 300) {
            sessionCache.delete(cacheKey)
            resolve(true)
          } else {
            sessionCache.delete(cacheKey)
            resolve(false)
          }
        })

        request_.on('error', (error) => {
          console.error('[Perplexity] Delete request error:', error)
          sessionCache.delete(cacheKey)
          resolve(false)
        })

        request_.write(payload)
        request_.end()
      })
    } catch (error) {
      console.error('[Perplexity] Delete session error:', error)
      sessionCache.delete(cacheKey)
      return false
    }
  }

  async deleteAllChats(): Promise<boolean> {
    const deleteUrl = `${PERPLEXITY_URL}/rest/thread/delete_all_threads?version=2.18&source=default`
    const pplxAccount = this.account.credentials.pplx_account || ''
    const deleteRequestId = uuid()

    const headers: Record<string, string> = {
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Content-Type': 'application/json',
      'Cookie': this.buildCookieHeader(),
      'Origin': PERPLEXITY_URL,
      'Priority': 'u=1, i',
      'Referer': `${PERPLEXITY_URL}/library`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0',
      'sec-ch-ua': '"Microsoft Edge";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'x-app-apiclient': 'default',
      'x-app-apiversion': '2.18',
      'x-perplexity-request-endpoint': deleteUrl,
      'x-perplexity-request-reason': 'threads-list',
      'x-perplexity-request-try-number': '1',
      'x-request-id': deleteRequestId,
      ...(pplxAccount ? { 'x-pplx-account': pplxAccount } : {}),
    }

    return new Promise((resolve) => {
      const request_ = https.request(deleteUrl, {
        method: 'DELETE',
      })

      for (const [key, value] of Object.entries(headers)) {
        request_.setHeader(key, value)
      }

      request_.on('response', (response) => {
        const statusCode = response.statusCode

        let responseBody = ''
        response.on('data', (chunk: Buffer) => {
          responseBody += chunk.toString()
        })

        response.on('end', () => {
          if (statusCode && statusCode >= 200 && statusCode < 300) {
            try {
              const data = JSON.parse(responseBody)
              if (data.status === 'success') {
                sessionCache.delete(this.account.id)
                resolve(true)
              } else {
                resolve(false)
              }
            } catch {
              resolve(false)
            }
          } else {
            resolve(false)
          }
        })
      })

      request_.on('error', (error) => {
        console.error('[Perplexity] Delete all chats error:', error)
        resolve(false)
      })

      request_.write(JSON.stringify({ delete_all: true }))
      request_.end()
    })
  }

  static isPerplexityProvider(provider: Provider): boolean {
    return provider.id === 'perplexity' || provider.apiEndpoint.includes('perplexity.ai')
  }

  static clearSessionCache(accountId: string): void {
    sessionCache.delete(accountId)
  }

  static getSessionData(accountId: string): SessionData | undefined {
    return sessionCache.get(accountId)
  }
}

export const perplexityAdapter = {
  PerplexityAdapter,
}

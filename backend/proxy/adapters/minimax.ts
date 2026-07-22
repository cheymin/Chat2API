/**
 * MiniMax Adapter
 * Based on MiniMax-Free-API implementation
 * https://github.com/LLM-Red-Team/MiniMax-Free-API
 */

import { PassThrough } from 'stream'
import http2, { ClientHttp2Session, ClientHttp2Stream } from 'http2'
import axios, { AxiosResponse } from 'axios'
import crypto from 'crypto'
import { createParser, EventSourceMessage } from 'eventsource-parser'
import FormData from 'form-data'
import { Account, Provider } from '../../store/types'
import { resolveMiniMaxCredentials } from '../../shared/minimaxCredentials'
import { toolsToSystemPrompt, TOOL_WRAP_HINT, hasToolPromptInjected, shouldInjectToolPrompt } from '../utils/tools'
import { parseToolCallsFromText } from '../utils/toolParser'
import { 
  createToolCallState, 
  processStreamContent, 
  flushToolCallBuffer,
  createBaseChunk,
  ToolCallState 
} from '../utils/streamToolHandler'

const AGENT_BASE_URL = 'https://agent.minimaxi.com'

const FAKE_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'Cache-Control': 'no-cache',
  Origin: 'https://agent.minimaxi.com',
  Pragma: 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
}

const FAKE_USER_DATA: Record<string, any> = {
  device_platform: 'web',
  biz_id: '3',
  app_id: '3001',
  version_code: '22201',
  uuid: null,
  device_id: null,
  os_name: 'Mac',
  browser_name: 'chrome',
  device_memory: 8,
  cpu_core_num: 11,
  browser_language: 'zh-CN',
  browser_platform: 'MacIntel',
  user_id: null,
  screen_width: 1920,
  screen_height: 1080,
  unix: null,
  lang: 'zh',
  token: null,
  timezone_offset: 28800,
  sys_language: 'zh',
  client: 'web',
}

interface MiniMaxMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | any[] | null
  tool_call_id?: string
  tool_calls?: any[]
}

interface ChatCompletionRequest {
  model: string
  originalModel?: string
  messages: MiniMaxMessage[]
  stream?: boolean
  temperature?: number
  tools?: any[]
  tool_choice?: any
  chatId?: string
}

interface DeviceInfo {
  deviceId: string
  userId: string
  realUserID: string
  jwtToken: string
  refreshTime: number
  uuid: string // Device registration uuid
}

interface CreditInfo {
  totalCredits: number
  usedCredits: number
  remainingCredits: number
  expiresAt?: number // Credit reset timestamp (milliseconds)
}

interface ChatListItem {
  chat_id: number
  chat_name: string
  update_time: number
  create_time: number
}

const deviceInfoMap = new Map<string, DeviceInfo>()
const DEVICE_INFO_EXPIRES = 10800

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function md5(input: string): string {
  return crypto.createHash('md5').update(input).digest('hex')
}

function unixTimestamp(): number {
  return Math.floor(Date.now() / 1000)
}

function tokenSplit(authorization: string): string[] {
  const token = authorization.replace('Bearer ', '')
  
  // Check if it's realUserID+JWTtoken format (contains +)
  if (token.includes('+')) {
    // Return the full token for parsing in constructor
    return [token]
  }
  
  // If no +, use the JWT token directly
  return [token]
}

function extractJWTDeviceID(jwtToken: string): string {
  try {
    const parts = jwtToken.split('.')
    if (parts.length !== 3) return ''
    const payload = parts[1]
    const padding = 4 - (payload.length % 4)
    const paddedPayload = padding !== 4 ? payload + '='.repeat(padding) : payload
    const decoded = Buffer.from(paddedPayload, 'base64').toString('utf8')
    const payloadObj = JSON.parse(decoded)
    return payloadObj?.user?.deviceID || ''
  } catch {
    return ''
  }
}

function checkResult(result: AxiosResponse): any {
  if (!result.data) return null
  const { statusInfo, data } = result.data
  if (typeof statusInfo !== 'object') return result.data
  const { code, message } = statusInfo as any
  if (code === 0) return data
  throw new Error(`[请求hailuo失败]: ${message}`)
}

export class MiniMaxAdapter {
  private provider: Provider
  private account: Account
  private rawToken: string
  private jwtToken: string
  private realUserID: string
  private jwtDeviceId: string
  private model: string
  private created: number

  constructor(provider: Provider, account: Account) {
    this.provider = provider
    this.account = account
    const resolved = resolveMiniMaxCredentials(account.credentials)
    if (resolved.error) {
      throw new Error(resolved.error)
    }

    this.rawToken = `${resolved.realUserID}+${resolved.jwtToken}`
    this.jwtToken = resolved.jwtToken
    this.realUserID = resolved.realUserID
    this.jwtDeviceId = extractJWTDeviceID(resolved.jwtToken)
    this.model = 'MiniMax-M2.7'
    this.created = unixTimestamp()
  }

  private async requestDeviceInfo(): Promise<DeviceInfo> {
    const cacheKey = this.rawToken
    let result = deviceInfoMap.get(cacheKey)
    
    if (result && result.refreshTime > unixTimestamp()) {
      return result
    }

    // Agent send_msg follows upstream MiniMax-Free-API chat-agent.ts:
    // use realUserID + JWT directly and do not rely on device/register for chat auth.
    const deviceId = this.jwtDeviceId || String(Math.floor(Math.random() * 1000000000))
    result = {
      deviceId,
      userId: this.realUserID,
      realUserID: this.realUserID,
      jwtToken: this.jwtToken,
      refreshTime: unixTimestamp() + DEVICE_INFO_EXPIRES,
      uuid: this.realUserID,
    }

    deviceInfoMap.set(cacheKey, result)
    return result
  }

  private async request(
    method: string,
    uri: string,
    data: any,
    deviceInfo: DeviceInfo,
    isStream: boolean = false
  ): Promise<AxiosResponse> {
    const unix = `${Date.now()}`;
    const timestamp = unixTimestamp();
    
    const userData = { ...FAKE_USER_DATA };
    const realUserID = deviceInfo.realUserID || deviceInfo.userId;
    userData.uuid = realUserID;
    userData.device_id = deviceInfo.deviceId || undefined;
    userData.user_id = realUserID;
    userData.unix = unix;
    userData.token = this.jwtToken;
    
    let queryStr = '';
    for (const key in userData) {
      if (userData[key] === undefined) continue;
      queryStr += `&${key}=${userData[key]}`;
    }
    queryStr = queryStr.substring(1);
    
    const dataJson = JSON.stringify(data || {});
    const fullUri = `${uri}${uri.lastIndexOf('?') != -1 ? '&' : '?'}${queryStr}`;
    
    let base = AGENT_BASE_URL;
    if (uri.includes('/message')) {
      base = 'https://agent-stream.minimaxi.com';
    }
    
    const yy = md5(`${encodeURIComponent(fullUri)}_${dataJson}${md5(unix)}ooui`);
    const signature = md5(`${timestamp}${this.jwtToken}${dataJson}`);

    return await axios.request({
      method,
      url: `${base}${fullUri}`,
      data,
      timeout: isStream ? 120000 : 15000,
      responseType: isStream ? 'stream' : 'json',
      validateStatus: () => true,
      headers: {
        Referer: `${AGENT_BASE_URL}/`,
        token: this.jwtToken,
        ...FAKE_HEADERS,
        'Content-Type': 'application/json',
        'x-timestamp': String(timestamp),
        'x-signature': signature,
        yy: yy,
      },
    });
  }

  private messagesPrepare(messages: MiniMaxMessage[], toolsPrompt?: string, isMultiTurn: boolean = false): any {
    // Process messages including tool calls and tool responses
    const processedMessages = messages.map(msg => {
      // Handle tool calls in assistant message
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        const toolCallsText = msg.tool_calls.map(tc => {
          return `[call:${tc.function.name}]${tc.function.arguments}[/call]`
        }).join('\n')
        return { ...msg, content: `[function_calls]\n${toolCallsText}\n[/function_calls]` }
      }
      // Handle tool response message
      if (msg.role === 'tool' && msg.tool_call_id) {
        return { 
          ...msg, 
          role: 'user' as const,
          content: `[TOOL_RESULT for ${msg.tool_call_id}] ${msg.content || ''}` 
        }
      }
      return msg
    })

    // Extract system message first
    let systemContent = ''
    const otherMessages = processedMessages.filter(msg => {
      if (msg.role === 'system') {
        const text = typeof msg.content === 'string' ? msg.content : ''
        systemContent = text
        return false
      }
      return true
    })
    
    let content = ''
    
    // Prepend system message if exists
    if (systemContent) {
      content = `system:${systemContent}\n`
    }
    
    // For multi-turn with existing session, only send the last user message
    if (isMultiTurn) {
      // Find last user message index manually (ES2021 compatible)
      let lastUserIdx = -1
      for (let i = otherMessages.length - 1; i >= 0; i--) {
        if (otherMessages[i].role === 'user') {
          lastUserIdx = i
          break
        }
      }
      
      if (lastUserIdx !== -1) {
        const lastUserMsg = otherMessages[lastUserIdx]
        const text = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : ''
        content += `user:${text}\n`
        
        // Include any tool results after the last user message
        for (let i = lastUserIdx + 1; i < otherMessages.length; i++) {
          if (otherMessages[i].role === 'user') {
            const toolText = typeof otherMessages[i].content === 'string' ? otherMessages[i].content : ''
            content += `user:${toolText}\n`
          }
        }
        
        if (toolsPrompt) {
          content = content.trim() + '\n\n' + toolsPrompt
        }
        return {
          msg_type: 1,
          text: content,
          chat_type: 1,
          attachments: [],
          selected_mcp_tools: [],
          backend_config: {},
          sub_agent_ids: [],
        }
      }
    }
    
    if (otherMessages.length < 2) {
      content += otherMessages.reduce((acc, msg) => {
        const text = typeof msg.content === 'string' ? msg.content : ''
        return acc + `${msg.role}:${text}\n`
      }, '')
    } else {
      const latestMessage = otherMessages[otherMessages.length - 1]
      const hasFileOrImage = Array.isArray(latestMessage.content) &&
        latestMessage.content.some((v: any) => typeof v === 'object' && ['file', 'image_url'].includes(v.type))
      
      if (hasFileOrImage) {
        const newFileMessage: MiniMaxMessage = {
          content: '关注用户最新发送文件和消息',
          role: 'system',
        }
        otherMessages.push(newFileMessage)
      }
      
      content += otherMessages.reduce((acc, msg) => {
        const text = typeof msg.content === 'string' ? msg.content : ''
        return acc + `${msg.role}:${text}\n`
      }, '') + 'assistant:\n'
      
      content = content.trim().replace(/\!\[.+\]\(.+\)/g, '')
    }

    // Append tools prompt at the end if provided
    if (toolsPrompt) {
      content = content.trim() + '\n\n' + toolsPrompt
    }

    return {
      msg_type: 1,
      text: content,
      chat_type: 1,
      attachments: [],
      selected_mcp_tools: [],
      backend_config: {},
      sub_agent_ids: [],
    }
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<{ response: AxiosResponse | null; stream: { session: ClientHttp2Session; stream: ClientHttp2Stream } | null; chatId: string }> {
    this.model = request.model || 'MiniMax-M3';
    this.created = unixTimestamp();
    
    const deviceInfo = await this.requestDeviceInfo();
    const messages = [...request.messages];
    
    let toolsPrompt = '';
    if (request.tools && request.tools.length > 0 && !hasToolPromptInjected(request.messages)) {
      toolsPrompt = toolsToSystemPrompt(request.tools);
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          const currentContent = messages[i].content;
          if (typeof currentContent === 'string') {
            messages[i] = { ...messages[i], content: currentContent + TOOL_WRAP_HINT };
          }
          break;
        }
      }
    }
    
    const requestBodyTemp = this.messagesPrepare(messages, toolsPrompt, false);
    const textContent = requestBodyTemp.text;
    
    const agentRes = await this.request('GET', '/archon/api/v1/agent', {}, deviceInfo);
    if (agentRes.status !== 200 || agentRes.data?.base_resp?.status_code !== 0) {
      throw new Error('Failed to get MiniMax agent list');
    }
    const agents = agentRes.data?.agents || [];
    const defaultAgent = agents.find((a: any) => a.agent_role === 'mavis') || agents[0];
    if (!defaultAgent) {
      throw new Error('No MiniMax agent found');
    }
    const agentId = defaultAgent.name;
    
    const sessionRes = await this.request('POST', `/archon/api/v1/agent/${agentId}/session`, { model: `minimax/${this.model}` }, deviceInfo);
    if (sessionRes.status !== 200 || sessionRes.data?.base_resp?.status_code !== 0) {
      throw new Error('Failed to create MiniMax session');
    }
    const sessionId = sessionRes.data.session_id;
    
    const turnId = uuid();
    const payload = {
      content: textContent,
      model: {
        provider_id: 'minimax',
        model_id: this.model,
        variant: this.model.toLowerCase().includes('thinking') || this.model.toLowerCase().includes('m3') ? 'thinking' : ''
      },
      turn_id: turnId,
      enable_team: true,
      worktreeMode: false
    };
    
    if (request.stream) {
      const msgRes = await this.request('POST', `/archon/api/v1/session/${sessionId}/message`, payload, deviceInfo, true);
      const transStream = new PassThrough();
      
      transStream.write(`data: ${JSON.stringify({
        id: sessionId,
        model: this.model,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
        created: this.created,
      })}\n\n`);
      
      const parser = createParser({
        onEvent: (event: EventSourceMessage) => {
        if (event.data === '[DONE]') {
          transStream.write(`data: ${JSON.stringify({
            id: sessionId,
            model: this.model,
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            created: this.created,
          })}\n\n`);
          transStream.end('data: [DONE]\n\n');
          return;
        }
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 6 && parsed.agent_message_chunk) {
             const chunk = parsed.agent_message_chunk;
             if (chunk.thinking_content) {
               transStream.write(`data: ${JSON.stringify({
                 id: sessionId,
                 model: this.model,
                 object: 'chat.completion.chunk',
                 choices: [{ index: 0, delta: { reasoning_content: chunk.thinking_content }, finish_reason: null }],
                 created: this.created,
               })}\n\n`);
             }
             if (chunk.content) {
               transStream.write(`data: ${JSON.stringify({
                 id: sessionId,
                 model: this.model,
                 object: 'chat.completion.chunk',
                 choices: [{ index: 0, delta: { content: chunk.content }, finish_reason: null }],
                 created: this.created,
               })}\n\n`);
             }
          }
        } catch(e) {}
        }
      });
      
      msgRes.data.on('data', (chunk: Buffer) => parser.feed(chunk.toString('utf8')));
      msgRes.data.on('end', () => transStream.end('data: [DONE]\n\n'));
      
      return { response: null, stream: { session: null as any, stream: transStream as any }, chatId: sessionId };
    } else {
      const msgRes = await this.request('POST', `/archon/api/v1/session/${sessionId}/message`, payload, deviceInfo, true);
      let fullContent = '';
      let fullThinking = '';
      
      const parser = createParser({
        onEvent: (event: EventSourceMessage) => {
        if (event.data === '[DONE]') return;
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 6 && parsed.agent_message_chunk) {
             const chunk = parsed.agent_message_chunk;
             if (chunk.thinking_content) fullThinking += chunk.thinking_content;
             if (chunk.content) fullContent += chunk.content;
          }
        } catch(e) {}
        }
      });
      
      await new Promise<void>((resolve, reject) => {
        msgRes.data.on('data', (chunk: Buffer) => parser.feed(chunk.toString('utf8')));
        msgRes.data.on('end', () => resolve());
        msgRes.data.on('error', reject);
      });
      
      const response = {
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
        data: {
          id: sessionId,
          model: this.model,
          object: 'chat.completion',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: fullContent,
              ...(fullThinking ? { reasoning_content: fullThinking } : {})
            },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          created: this.created,
        },
      };
      return { response, stream: null, chatId: sessionId };
    }
  }


  async deleteChat(chatId: string): Promise<boolean> {
    const maxRetries = 3
    const retryDelay = 2000
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const deviceInfo = await this.requestDeviceInfo()
        const response = await this.request('POST', '/matrix/api/v1/chat/delete_chat', { chat_id: parseInt(chatId, 10) }, deviceInfo)
        if (response.status === 200 && response.data?.base_resp?.status_code === 0) {
          return true
        }
        
        const errorMsg = response.data?.base_resp?.status_msg || 'Unknown error'
        
        if (errorMsg.includes('chat is running') && attempt < maxRetries) {
          console.log(`[MiniMax] Chat still running, waiting ${retryDelay}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, retryDelay))
          continue
        }
        
        console.warn('[MiniMax] Delete chat failed:', errorMsg)
        return false
      } catch (error) {
        console.error('[MiniMax] Failed to delete chat:', error)
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay))
          continue
        }
        return false
      }
    }
    
    return false
  }

  async getUserInfo(): Promise<any> {
    const deviceInfo = await this.requestDeviceInfo()
    const response = await this.request('GET', '/v1/api/user/info', {}, deviceInfo)
    if (response.status !== 200 || response.data?.statusInfo?.code !== 0) {
      throw new Error(`Failed to get user info: ${response.data?.statusInfo?.message || response.status}`)
    }
    return response.data.data
  }

  async getCredits(): Promise<CreditInfo> {
    try {
      const deviceInfo = await this.requestDeviceInfo()
      
      const response = await this.request('POST', '/matrix/api/v1/commerce/get_membership_info', {}, deviceInfo)
      
      if (response.status === 200 && response.data?.base_resp?.status_code === 0) {
        const data = response.data
        const remainingCredits = data?.daily_login_gift_credit_remaining || 0
        
        // Get credit expires timestamp (resets at next day 00:00)
        let expiresAt: number | undefined = undefined
        const creditsData = data?.credits?.['4']?.[0]
        if (creditsData?.expires_at) {
          // expires_at is in milliseconds, use it directly
          expiresAt = creditsData.expires_at
        }
        
        return {
          totalCredits: 0, // Not available
          usedCredits: 0, // Not available
          remainingCredits,
          expiresAt,
        }
      }
      
      console.warn('[MiniMax] Failed to get membership info, token may be expired or invalid')
      return { totalCredits: 0, usedCredits: 0, remainingCredits: 0 }
    } catch (error) {
      console.error('[MiniMax] Failed to get credits:', error instanceof Error ? error.message : 'Unknown error')
      return { totalCredits: 0, usedCredits: 0, remainingCredits: 0 }
    }
  }

  async getChatList(): Promise<ChatListItem[]> {
    const allChats: ChatListItem[] = []
    let nextPageIndexId: number | undefined = undefined
    const pageSize = 100
    
    try {
      const deviceInfo = await this.requestDeviceInfo()
      
      while (true) {
        const requestBody: any = {
          page_size: pageSize,
          workspace_storage_mode: 0,
        }
        
        if (nextPageIndexId !== undefined) {
          requestBody.next_page_index_id = nextPageIndexId
        }
        
        const response = await this.request('POST', '/matrix/api/v1/chat/list_chat', requestBody, deviceInfo)
        
        if (response.status !== 200 || response.data?.base_resp?.status_code !== 0) {
          console.error('[MiniMax] Failed to get chat list:', response.data?.base_resp?.status_msg)
          break
        }
        
        const chatList = response.data?.chats || response.data?.chat_list || []
        if (chatList.length === 0) {
          break
        }
        
        allChats.push(...chatList)
        
        if (chatList.length < pageSize) {
          break
        }
        
        nextPageIndexId = chatList[chatList.length - 1]?.chat_id
      }
      
      return allChats
    } catch (error) {
      console.error('[MiniMax] Failed to get chat list:', error)
      return []
    }
  }

  async deleteAllChats(): Promise<boolean> {
    try {
      const chatList = await this.getChatList()
      if (chatList.length === 0) {
        return true
      }
      
      let successCount = 0
      let failCount = 0
      
      for (const chat of chatList) {
        const result = await this.deleteChat(String(chat.chat_id))
        if (result) {
          successCount++
        } else {
          failCount++
        }
        
        if (successCount % 10 === 0) {
          console.log(`[MiniMax] Deleted ${successCount}/${chatList.length} chats...`)
        }
      }
      
      console.log(`[MiniMax] Delete all chats completed. Success: ${successCount}, Failed: ${failCount}`)
      return failCount === 0
    } catch (error) {
      console.error('[MiniMax] Failed to delete all chats:', error)
      return false
    }
  }

  static isMiniMaxProvider(provider: Provider): boolean {
    return provider.id === 'minimax' || 
           provider.apiEndpoint.includes('minimaxi.com') ||
           provider.apiEndpoint.includes('hailuoai.com')
  }
}

export class MiniMaxStreamHandler {
  private chatId: string = ''
  private model: string
  private created: number
  private onEnd?: (chatId: string) => void
  private toolCallState: ToolCallState
  private sentRole: boolean = false

  constructor(model: string, onEnd?: (chatId: string) => void) {
    this.model = model
    this.created = Math.floor(Date.now() / 1000)
    this.onEnd = onEnd
    this.toolCallState = createToolCallState()
  }

  setChatId(chatId: string) {
    this.chatId = chatId
  }

  getChatId(): string {
    return this.chatId
  }

  handleStream(stream: ClientHttp2Stream): PassThrough {
    const transStream = new PassThrough()
    let content = ''
    let hasReceivedData = false
    let httpStatus: number | null = null
    let buffer = ''

    // Listen for HTTP/2 response headers to check status code
    stream.once('response', (headers: http2.IncomingHttpHeaders) => {
      const statusValue = headers[':status']
      httpStatus = 200
      if (typeof statusValue === 'string') {
        httpStatus = parseInt(statusValue, 10)
      } else if (typeof statusValue === 'number') {
        httpStatus = statusValue
      }

      // If status is not 200, emit error and close stream
      if (httpStatus >= 400) {
        const errorMessage = `MiniMax API error: HTTP ${httpStatus}`
        console.error('[MiniMax]', errorMessage)

        // Emit error event on the transform stream for the client to handle
        transStream.emit('error', new Error(errorMessage))
        transStream.end()
        return
      }
    })

    // Use SSE parser for event stream format
    const parser = createParser({
      onEvent: (event: EventSourceMessage) => {
        try {
          hasReceivedData = true
          const eventName = event.event
          if (event.data === '[DONE]') return

          const result = JSON.parse(event.data)
          const { type, base_resp, statusInfo, data: _data } = result

          if (type === 8) {
            // Flush any remaining tool calls
            const baseChunk = createBaseChunk(this.chatId, this.model, this.created)
            const flushChunks = flushToolCallBuffer(this.toolCallState, baseChunk, 'minimax')
            
            for (const outChunk of flushChunks) {
              transStream.write(`data: ${JSON.stringify(outChunk)}\n\n`)
            }
            
            const finishReason = this.toolCallState.hasEmittedToolCall ? 'tool_calls' : 'stop'
            transStream.write(
              `data: ${JSON.stringify({
                id: this.chatId || `minimax-${Date.now()}`,
                model: this.model,
                object: 'chat.completion.chunk',
                choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
                created: this.created,
              })}\n\n`
            )
            transStream.end('data: [DONE]\n\n')
            if (this.onEnd) this.onEnd(this.chatId)
            return
          }

          const respCode = base_resp?.status_code ?? statusInfo?.code
          const respMessage = base_resp?.status_msg ?? statusInfo?.message
          if (respCode !== 0 && respCode !== undefined && type !== 3) {
            throw new Error(`Stream response error: ${respMessage}`)
          }

          const { messageResult } = _data || {}
          if (eventName === 'message_result' && messageResult) {
            const { chatID, chat_id, isEnd, content: text } = messageResult
            const finalChatId = chat_id || chatID

            if (isEnd !== 0 && !text) return

            if (!this.chatId && finalChatId) this.chatId = finalChatId

            const exceptCharIndex = text.indexOf('')
            const chunk = text.substring(
              exceptCharIndex !== -1
                ? Math.min(content.length, exceptCharIndex)
                : content.length,
              exceptCharIndex === -1 ? text.length : exceptCharIndex
            )
            content += chunk

            // Process tool call interception
            const baseChunk = createBaseChunk(this.chatId, this.model, this.created)
            const { chunks: outputChunks } = processStreamContent(
              chunk, 
              this.toolCallState, 
              baseChunk, 
              !this.sentRole,
              'minimax'
            )

            for (const outChunk of outputChunks) {
              transStream.write(`data: ${JSON.stringify(outChunk)}\n\n`)
            }

            if (outputChunks.length > 0) this.sentRole = true

            if (isEnd === 0) {
              // Flush any remaining tool calls
              const flushChunks = flushToolCallBuffer(this.toolCallState, baseChunk, 'minimax')
              
              for (const outChunk of flushChunks) {
                transStream.write(`data: ${JSON.stringify(outChunk)}\n\n`)
              }
              
              const finishReason = this.toolCallState.hasEmittedToolCall ? 'tool_calls' : 'stop'
              transStream.write(
                `data: ${JSON.stringify({
                  id: this.chatId || `minimax-${Date.now()}`,
                  model: this.model,
                  object: 'chat.completion.chunk',
                  choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
                  created: this.created,
                })}\n\n`
              )
              transStream.end('data: [DONE]\n\n')
              if (this.onEnd) this.onEnd(this.chatId)
            }
          }
        } catch (err) {
          console.error('[MiniMax] Stream parse error:', err)
          transStream.emit('error', err instanceof Error ? err : new Error(String(err)))
          transStream.end()
        }
      }
    })

    stream.on('data', (chunk: Buffer) => {
      hasReceivedData = true
      const chunkStr = chunk.toString()

      // Try to parse as SSE first
      if (chunkStr.includes('event:') || chunkStr.includes('data:')) {
        parser.feed(chunkStr)
      } else {
        // Try to parse as direct JSON (non-SSE format)
        buffer += chunkStr
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const result = JSON.parse(line)

            const { type, base_resp, statusInfo, data: _data, chat_id, msg_id } = result

            // Handle initial response with chat_id
            if (chat_id && !this.chatId) {
              this.chatId = chat_id
              continue
            }

            // Handle type 8 (end of stream)
            if (type === 8) {
              transStream.write(
                `data: ${JSON.stringify({
                  id: this.chatId || `minimax-${Date.now()}`,
                  model: this.model,
                  object: 'chat.completion.chunk',
                  choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                  created: this.created,
                })}\n\n`
              )
              transStream.end('data: [DONE]\n\n')
              if (this.onEnd) this.onEnd(this.chatId)
              return
            }

            // Check for errors
            const respCode = base_resp?.status_code ?? statusInfo?.code
            const respMessage = base_resp?.status_msg ?? statusInfo?.message
            if (respCode !== 0 && respCode !== undefined && type !== 3) {
              console.error('[MiniMax] Stream response error:', respMessage)
              continue
            }

            // Handle message result
            const { messageResult } = _data || {}
            if (messageResult) {
              const { chatID, chat_id: agentChatId, isEnd, content: text } = messageResult
              const finalChatId = agentChatId || chatID

              if (isEnd !== 0 && !text) continue

              if (!this.chatId && finalChatId) this.chatId = finalChatId

              const exceptCharIndex = text.indexOf('')
              const chunk = text.substring(
                exceptCharIndex !== -1
                  ? Math.min(content.length, exceptCharIndex)
                  : content.length,
                exceptCharIndex === -1 ? text.length : exceptCharIndex
              )
              content += chunk

              transStream.write(
                `data: ${JSON.stringify({
                  id: this.chatId || `minimax-${Date.now()}`,
                  model: this.model,
                  object: 'chat.completion.chunk',
                  choices: [{ index: 0, delta: { content: chunk }, finish_reason: isEnd === 0 ? 'stop' : null }],
                  created: this.created,
                })}\n\n`
              )

              if (isEnd === 0) {
                transStream.end('data: [DONE]\n\n')
                if (this.onEnd) this.onEnd(this.chatId)
              }
            }
          } catch (err) {
            // Not valid JSON, might be SSE format
            parser.feed(line + '\n')
          }
        }
      }
    })

    stream.once('error', (err: Error) => {
      console.error('[MiniMax] Stream error:', err)
      transStream.emit('error', err)
      transStream.end()
    })

    stream.once('close', () => {
      // Process any remaining data in buffer
      if (buffer.trim()) {
        try {
          JSON.parse(buffer.trim())
        } catch (e) {
          parser.feed(buffer)
        }
      }
      // Only end gracefully if we received data successfully
      if (hasReceivedData || (httpStatus && httpStatus < 400)) {
        transStream.end('data: [DONE]\n\n')
      }
    })

    return transStream
  }

  async handleNonStream(stream: any): Promise<any> {
    // Parameter 'stream' is response.data from forwarder.ts (the actual stream/data)
    return new Promise((resolve, reject) => {
      const data = {
        id: '',
        model: this.model,
        object: 'chat.completion',
        choices: [{ 
          index: 0, 
          message: { 
            role: 'assistant', 
            content: '', 
            reasoning_content: '' 
          }, 
          finish_reason: 'stop' 
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        created: this.created,
      }

      const parser = createParser({
        onEvent: (event: EventSourceMessage) => {
          try {
            if (event.data === '[DONE]') return
            const result = JSON.parse(event.data)
            const { type, base_resp, statusInfo, data: _data } = result
            const respCode = base_resp?.status_code ?? statusInfo?.code
            const respMessage = base_resp?.status_msg ?? statusInfo?.message
            if (respCode !== 0 && respCode !== undefined && type !== 3) {
              throw new Error(`Stream response error: ${respMessage}`)
            }
            const { messageResult } = _data || {}
            if (event.event === 'message_result' && messageResult) {
              const { chatID, chat_id, isEnd, content: text, extra_info } = messageResult
              const finalChatId = chat_id || chatID
              if (!data.id && finalChatId) data.id = finalChatId
              if (isEnd !== 0 && text) data.choices[0].message.content += text
              // Extract thinking_content from extra_info
              if (extra_info?.thinking_content) {
                data.choices[0].message.reasoning_content = extra_info.thinking_content
              }
              if (isEnd === 0) resolve(data)
            }
          } catch (err) {
            reject(err)
          }
        },
      })

      stream.on('data', (buffer: Buffer) => parser.feed(buffer.toString()))
      stream.once('error', reject)
      stream.once('close', () => resolve(data))
    })
  }
}

export const minimaxAdapter = {
  MiniMaxAdapter,
  MiniMaxStreamHandler,
}

/**
 * ChatGPT (chatgpt.com) Authentication Adapter
 *
 * Uses Codex CLI OAuth2 PKCE tokens against the Responses API at
 * /backend-api/codex/responses. The OAuth access_token can be
 * refreshed with the refresh_token via auth.openai.com/token.
 */

import axios from 'axios'
import { BaseOAuthAdapter } from './base'
import {
  OAuthResult,
  OAuthOptions,
  TokenValidationResult,
  CredentialInfo,
  AdapterConfig,
  OAuthCallbackData,
} from '../types'

const OPENAI_AUTH_BASE = 'https://auth.openai.com'
const CHATGPT_API_BASE = 'https://chatgpt.com'

const FAKE_HEADERS = {
  Accept: 'text/event-stream',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Origin: CHATGPT_API_BASE,
  Pragma: 'no-cache',
  'OpenAI-Beta': 'responses=experimental',
  Originator: 'codex_cli_rs',
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Priority: 'u=1, i',
}

interface CachedToken {
  accessToken: string
  refreshToken: string
  expiresAt: number
  accountId?: string
}

const tokenCache = new Map<string, CachedToken>()

export class ChatGPTAdapter extends BaseOAuthAdapter {
  constructor(config: AdapterConfig) {
    super({
      ...config,
      providerType: 'chatgpt',
      authMethods: ['manual'],
      loginUrl: 'https://auth.openai.com/authorize',
      apiUrl: CHATGPT_API_BASE,
    })
  }

  /**
   * Decode JWT payload (without verification) to read exp / account_id.
   */
  private decodeJwt(token: string): Record<string, any> | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) return null
      const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
      return JSON.parse(payload)
    } catch {
      return null
    }
  }

  /**
   * Refresh the OAuth access_token using the refresh_token.
   * Endpoint documented by openai-oauth / ccproxy / CLIProxyAPI.
   */
  async refreshAccessToken(refreshToken: string): Promise<CachedToken | null> {
    try {
      const response = await axios.post(
        `${OPENAI_AUTH_BASE}/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...FAKE_HEADERS,
            'User-Agent': 'codex_cli_rs/0.128.0',
          },
          timeout: 20000,
          validateStatus: () => true,
        }
      )

      if (response.status !== 200 || !response.data?.access_token) {
        return null
      }

      const payload = this.decodeJwt(response.data.access_token) || {}
      const expiresAt = (payload.exp as number) * 1000 || Date.now() + 3600 * 1000
      const accountId = payload['https://api.openai.com/auth']?.user_id || payload.sub

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || refreshToken,
        expiresAt,
        accountId,
      }
    } catch (error) {
      console.error('[ChatGPT] Failed to refresh token:', error)
      return null
    }
  }

  /**
   * Acquire a valid access token, refreshing when necessary.
   * Cache key is the refresh token (or the access token if no refresh).
   */
  async acquireToken(credentials: Record<string, string>): Promise<{ accessToken: string; accountId?: string } | null> {
    const accessToken = credentials.token || credentials.accessToken || credentials.access_token
    const refreshToken = credentials.refreshToken || credentials.refresh_token || ''
    const accountId = credentials.accountId || credentials.account_id

    if (!accessToken && !refreshToken) {
      return null
    }

    const cacheKey = refreshToken || accessToken
    let cached = cacheKey ? tokenCache.get(cacheKey) : undefined

    const now = Date.now()
    if (cached && cached.expiresAt - now > 60_000) {
      return { accessToken: cached.accessToken, accountId: cached.accountId || accountId }
    }

    if (refreshToken) {
      const refreshed = await this.refreshAccessToken(refreshToken)
      if (refreshed) {
        tokenCache.set(refreshToken, refreshed)
        return { accessToken: refreshed.accessToken, accountId: refreshed.accountId || accountId }
      }
    }

    // Fall back to the provided access token if refresh failed
    if (accessToken) {
      const payload = this.decodeJwt(accessToken) || {}
      const expiresAt = (payload.exp as number) * 1000 || Date.now() + 3600 * 1000
      const derivedAccount = payload['https://api.openai.com/auth']?.user_id || payload.sub || accountId
      cached = { accessToken, refreshToken, expiresAt, accountId: derivedAccount }
      if (cacheKey) tokenCache.set(cacheKey, cached)
      return { accessToken, accountId: derivedAccount }
    }

    return null
  }

  async startLogin(options: OAuthOptions): Promise<OAuthResult> {
    this.emitProgress('pending', 'Please log in via browser and run `npx @openai/codex login` to obtain an OAuth token')

    return {
      success: false,
      providerId: options.providerId,
      providerType: 'chatgpt',
      error: 'Codex OAuth flow must be completed out-of-band. Run `npx @openai/codex login` (or `npx openai-oauth`) and paste the access_token / refresh_token from ~/.codex/auth.json into the credential fields.',
    }
  }

  protected async processCallback(_data: OAuthCallbackData): Promise<void> {
    // Codex OAuth is performed out-of-band
  }

  /**
   * Validate the OAuth token by issuing a minimal Responses API call.
   */
  async validateToken(credentials: Record<string, string>): Promise<TokenValidationResult> {
    const tokenInfo = await this.acquireToken(credentials)
    if (!tokenInfo) {
      return { valid: false, error: 'No access token or refresh token provided' }
    }

    try {
      // Issue a minimal responses request (model auto, "ping" input) to verify
      const response = await axios.post(
        `${CHATGPT_API_BASE}/backend-api/codex/responses`,
        {
          model: 'auto',
          input: 'ping',
          stream: false,
          store: false,
        },
        {
          headers: {
            Authorization: `Bearer ${tokenInfo.accessToken}`,
            'Content-Type': 'application/json',
            'session_id': tokenInfo.accountId || this.generateUUID(),
            ...FAKE_HEADERS,
          },
          timeout: 20000,
          validateStatus: () => true,
        }
      )

      if (response.status === 401) {
        return { valid: false, error: 'Access token is invalid or expired' }
      }
      if (response.status >= 400) {
        return { valid: false, error: `Validation failed: HTTP ${response.status}` }
      }

      return {
        valid: true,
        tokenType: 'access',
        accountInfo: {
          userId: tokenInfo.accountId,
        },
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation request failed',
      }
    }
  }

  async refreshToken(credentials: Record<string, string>): Promise<CredentialInfo | null> {
    const refreshToken = credentials.refreshToken || credentials.refresh_token
    if (!refreshToken) return null

    const refreshed = await this.refreshAccessToken(refreshToken)
    if (!refreshed) return null

    return {
      type: 'access',
      value: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
      refreshToken: refreshed.refreshToken,
      extra: refreshed.accountId ? { accountId: refreshed.accountId } : undefined,
    }
  }
}

export default ChatGPTAdapter

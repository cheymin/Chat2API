/**
 * Google Gemini Web (gemini.google.com) Authentication Adapter
 *
 * Cookie-based authentication. The two required cookies are
 * __Secure-1PSID and __Secure-1PSIDTS. The adapter also scrapes the
 * SNlM0e (CSRF) token and the `bl` build label from /app on first
 * use, and refreshes them when the cookies rotate.
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

const GEMINI_BASE = 'https://gemini.google.com'

export interface GeminiSessionState {
  cookies: string
  snlM0e: string
  bl: string
  fsid: string
  updatedAt: number
}

const sessionCache = new Map<string, GeminiSessionState>()

/**
 * Parse a raw Cookie header string into a key->value map.
 */
export function parseCookies(cookieStr: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!cookieStr) return result
  for (const part of cookieStr.split(';')) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key) result[key] = value
  }
  return result
}

/**
 * Read a single cookie value from a raw cookie header.
 */
export function getCookie(cookieStr: string, name: string): string | undefined {
  return parseCookies(cookieStr)[name]
}

export class GeminiAdapter extends BaseOAuthAdapter {
  constructor(config: AdapterConfig) {
    super({
      ...config,
      providerType: 'gemini',
      authMethods: ['manual', 'cookie'],
      loginUrl: GEMINI_BASE,
      apiUrl: GEMINI_BASE,
    })
  }

  /**
   * Initialize a session: fetch /app and scrape SNlM0e, bl, f.sid.
   * The result is cached per cookie-string so we don't re-scrape on
   * every request.
   */
  async initSession(cookieStr: string): Promise<GeminiSessionState> {
    const cached = sessionCache.get(cookieStr)
    if (cached && Date.now() - cached.updatedAt < 5 * 60 * 1000) {
      return cached
    }

    const response = await axios.get(`${GEMINI_BASE}/app`, {
      headers: {
        Cookie: cookieStr,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 20000,
      validateStatus: () => true,
    })

    if (response.status !== 200 || typeof response.data !== 'string') {
      throw new Error(`Failed to init Gemini session: HTTP ${response.status}`)
    }

    const html: string = response.data
    const snlMatch = html.match(/"SNlM0e":"([^"]+)"/)
    const blMatch = html.match(/"cfb2h":"([^"]+)"/)
    const fsidMatch = html.match(/"FdrFJe":"([\d-]+)"/)

    if (!snlMatch || !blMatch) {
      throw new Error('Failed to scrape SNlM0e / bl from Gemini /app — cookies may be invalid or rotated')
    }

    const state: GeminiSessionState = {
      cookies: cookieStr,
      snlM0e: snlMatch[1],
      bl: blMatch[1],
      fsid: fsidMatch ? fsidMatch[1] : '',
      updatedAt: Date.now(),
    }
    sessionCache.set(cookieStr, state)
    return state
  }

  async startLogin(options: OAuthOptions): Promise<OAuthResult> {
    this.emitProgress('pending', 'Please log in via browser and copy cookies from DevTools')

    return {
      success: false,
      providerId: options.providerId,
      providerType: 'gemini',
      error: 'Cookie-based authentication. Open https://gemini.google.com, log in, then copy the cookie header (especially __Secure-1PSID and __Secure-1PSIDTS) from DevTools Network tab.',
    }
  }

  protected async processCallback(_data: OAuthCallbackData): Promise<void> {
    // Gemini does not support OAuth callback
  }

  /**
   * Validate cookies by attempting to init a session.
   */
  async validateToken(credentials: Record<string, string>): Promise<TokenValidationResult> {
    const cookieStr = credentials.cookie || credentials.cookies || ''
    if (!cookieStr) {
      return { valid: false, error: 'No cookies provided' }
    }

    if (!getCookie(cookieStr, '__Secure-1PSID')) {
      return { valid: false, error: 'Missing __Secure-1PSID cookie' }
    }

    try {
      const state = await this.initSession(cookieStr)
      if (!state.snlM0e) {
        return { valid: false, error: 'Cookies are invalid (could not scrape SNlM0e)' }
      }

      return {
        valid: true,
        tokenType: 'cookie',
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      }
    }
  }

  async refreshToken(_credentials: Record<string, string>): Promise<CredentialInfo | null> {
    // Gemini cookies auto-rotate via accounts.google.com/RotateCookies in the browser.
    // We can't refresh them server-side; the user must re-paste when they expire.
    return null
  }
}

export default GeminiAdapter

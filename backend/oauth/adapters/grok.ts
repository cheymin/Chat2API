/**
 * Grok (grok.com) Authentication Adapter
 *
 * Cookie-based. The load-bearing cookies are `sso` and `sso-rw`,
 * issued by x.com SSO after login. Anonymous mode uses the
 * `x-anonuserid` + `x-challenge` + `x-signature` triplet issued on
 * first page load.
 *
 * The `x-statsig-id` header is an encrypted blob produced by the
 * in-page Statsig SDK; it cannot be regenerated server-side. The
 * adapter accepts it as an optional credential.
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

const GROK_BASE = 'https://grok.com'

const FAKE_HEADERS = {
  Accept: '*/*',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Origin: GROK_BASE,
  Pragma: 'no-cache',
  Referer: `${GROK_BASE}/`,
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Priority: 'u=1, i',
}

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

export function getCookie(cookieStr: string, name: string): string | undefined {
  return parseCookies(cookieStr)[name]
}

export class GrokAdapter extends BaseOAuthAdapter {
  constructor(config: AdapterConfig) {
    super({
      ...config,
      providerType: 'grok',
      authMethods: ['manual', 'cookie'],
      loginUrl: GROK_BASE,
      apiUrl: GROK_BASE,
    })
  }

  /**
   * Build the request headers for a Grok API call. The x-statsig-id
   * header is optional but strongly recommended.
   */
  buildHeaders(cookieStr: string, statsigId?: string): Record<string, string> {
    const headers: Record<string, string> = {
      ...FAKE_HEADERS,
      'Content-Type': 'application/json',
      Cookie: cookieStr,
      'x-xai-request-id': this.generateUUID(),
    }
    if (statsigId) {
      headers['x-statsig-id'] = statsigId
    }
    return headers
  }

  async startLogin(options: OAuthOptions): Promise<OAuthResult> {
    this.emitProgress('pending', 'Please log in via browser and copy cookies from DevTools')

    return {
      success: false,
      providerId: options.providerId,
      providerType: 'grok',
      error: 'Cookie-based authentication. Open https://grok.com, log in via x.com SSO, then copy the cookie header (especially `sso` and `sso-rw`) from DevTools Network tab.',
    }
  }

  protected async processCallback(_data: OAuthCallbackData): Promise<void> {
    // Grok does not support OAuth callback
  }

  /**
   * Validate cookies by querying rate-limits (cheap authenticated GET).
   */
  async validateToken(credentials: Record<string, string>): Promise<TokenValidationResult> {
    const cookieStr = credentials.cookie || credentials.cookies || ''
    if (!cookieStr) {
      return { valid: false, error: 'No cookies provided' }
    }

    const hasSso = Boolean(getCookie(cookieStr, 'sso') || getCookie(cookieStr, 'sso-rw'))
    const hasAnon = Boolean(
      getCookie(cookieStr, 'x-anonuserid') &&
        getCookie(cookieStr, 'x-challenge') &&
        getCookie(cookieStr, 'x-signature')
    )

    if (!hasSso && !hasAnon) {
      return {
        valid: false,
        error: 'Missing required cookies: `sso`/`sso-rw` for logged-in mode, or `x-anonuserid`+`x-challenge`+`x-signature` for anonymous mode',
      }
    }

    const statsigId = credentials.statsigId || credentials.statsig_id

    try {
      const response = await axios.post(
        `${GROK_BASE}/rest/rate-limits`,
        {
          requestKind: 'DEFAULT',
          modelName: 'grok-4',
        },
        {
          headers: this.buildHeaders(cookieStr, statsigId),
          timeout: 15000,
          validateStatus: () => true,
        }
      )

      if (response.status === 401 || response.status === 403) {
        return { valid: false, error: `Cookies rejected (HTTP ${response.status}). The x-statsig-id header may be required.` }
      }
      if (response.status >= 400) {
        // Some accounts return 429 on rate-limits endpoint but the cookies are still valid
        if (response.status === 429) {
          return { valid: true, tokenType: 'cookie' }
        }
        return { valid: false, error: `Validation failed: HTTP ${response.status}` }
      }

      return {
        valid: true,
        tokenType: 'cookie',
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation request failed',
      }
    }
  }

  async refreshToken(_credentials: Record<string, string>): Promise<CredentialInfo | null> {
    return null
  }
}

export default GrokAdapter

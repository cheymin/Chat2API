/**
 * OAuth Module Type Definitions
 * Defines types and interfaces for provider authentication
 */

import type { ProviderVendor } from '../shared/types'

export type ProviderType = Exclude<ProviderVendor, 'custom'>

export type { ProviderVendor }

/**
 * Authentication method
 */
export type AuthMethod = 'oauth' | 'token' | 'cookie' | 'manual'

/**
 * OAuth login status
 */
export type OAuthStatus = 'idle' | 'pending' | 'success' | 'error' | 'cancelled'

/**
 * Token type
 */
export type TokenType = 'jwt' | 'refresh' | 'access' | 'cookie' | 'token'

/**
 * OAuth login result
 */
export interface OAuthResult {
  success: boolean
  providerId?: string
  providerType?: ProviderType
  credentials?: Record<string, string>
  accountInfo?: OAuthAccountInfo
  error?: string
}

/**
 * OAuth account info
 */
export interface OAuthAccountInfo {
  userId?: string
  email?: string
  name?: string
  avatar?: string
  quota?: number
  used?: number
  expiresAt?: number
}

/**
 * OAuth login options
 */
export interface OAuthOptions {
  providerId: string
  providerType: ProviderType
  callbackPort?: number
  timeout?: number
}

/**
 * OAuth callback data
 */
export interface OAuthCallbackData {
  code?: string
  token?: string
  state?: string
  error?: string
  errorDescription?: string
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean
  tokenType?: TokenType
  expiresAt?: number
  accountInfo?: OAuthAccountInfo
  error?: string
}

/**
 * Credential info
 */
export interface CredentialInfo {
  type: TokenType
  value: string
  expiresAt?: number
  refreshToken?: string
  extra?: Record<string, string>
}

/**
 * Adapter config
 */
export interface AdapterConfig {
  providerId: string
  providerType: ProviderType
  authMethods: AuthMethod[]
  callbackPort: number
  loginUrl?: string
  apiUrl?: string
}

/**
 * OAuth progress event
 */
export interface OAuthProgressEvent {
  status: OAuthStatus
  message: string
  progress?: number
  data?: Record<string, unknown>
}

/**
 * Manual token input config
 */
export interface ManualTokenConfig {
  providerType: ProviderType
  tokenType: TokenType
  label: string
  placeholder: string
  description: string
  helpUrl?: string
}

/**
 * Manual input config for each provider
 */
export const MANUAL_TOKEN_CONFIGS: Partial<Record<ProviderType, ManualTokenConfig[]>> = {
  deepseek: [
    {
      providerType: 'deepseek',
      tokenType: 'token',
      label: 'User Token',
      placeholder: 'Enter the userToken obtained from browser LocalStorage',
      description: 'Open Developer Tools on chat.deepseek.com, find userToken in Application > Local Storage',
      helpUrl: 'https://chat.deepseek.com',
    },
  ],
  glm: [
    {
      providerType: 'glm',
      tokenType: 'refresh',
      label: 'Refresh Token',
      placeholder: 'Enter refresh_token',
      description: 'After logging in to chatglm.cn, get refresh_token from Cookie or API response',
      helpUrl: 'https://chatglm.cn',
    },
  ],
  kimi: [
    {
      providerType: 'kimi',
      tokenType: 'jwt',
      label: 'Access Token (JWT)',
      placeholder: 'Enter JWT format access_token',
      description: 'JWT Token starting with eyJ, obtained from browser Developer Tools',
      helpUrl: 'https://www.kimi.com',
    },
    {
      providerType: 'kimi',
      tokenType: 'jwt',
      label: 'JWT Token (kimi-auth)',
      placeholder: 'Enter JWT token from kimi-auth cookie',
      description: 'Get JWT token from kimi-auth cookie in browser DevTools',
      helpUrl: 'https://www.kimi.com',
    },
  ],
  minimax: [
    {
      providerType: 'minimax',
      tokenType: 'token',
      label: 'Token (realUserID_token)',
      placeholder: 'Format: realUserID_token',
      description: 'Obtain after logging in to agent.minimaxi.com, format is realUserID + "_" + token',
      helpUrl: 'https://agent.minimaxi.com',
    },
  ],
  qwen: [
    {
      providerType: 'qwen',
      tokenType: 'cookie',
      label: 'tongyi_sso_ticket',
      placeholder: 'Enter tongyi_sso_ticket',
      description: 'After logging in to www.qianwen.com, get tongyi_sso_ticket from Cookie',
      helpUrl: 'https://www.qianwen.com',
    },
  ],
  'qwen-ai': [
    {
      providerType: 'qwen-ai',
      tokenType: 'jwt',
      label: 'Auth Token',
      placeholder: 'Enter JWT token from chat.qwen.ai',
      description: 'JWT token obtained from chat.qwen.ai Local Storage (key: "token")',
      helpUrl: 'https://chat.qwen.ai',
    },
  ],
  perplexity: [
    {
      providerType: 'perplexity',
      tokenType: 'cookie',
      label: 'Cookies',
      placeholder: 'Paste Perplexity cookies or import HAR file',
      description: 'Get cookies from perplexity.ai browser DevTools or import HAR file',
      helpUrl: 'https://www.perplexity.ai',
    },
  ],
  chatgpt: [
    {
      providerType: 'chatgpt',
      tokenType: 'access',
      label: 'Access Token',
      placeholder: 'OAuth access token from ~/.codex/auth.json',
      description: 'OAuth2 PKCE access token issued by auth.openai.com for Codex CLI. Obtain via `npx @openai/codex login` or the openai-oauth flow.',
      helpUrl: 'https://chatgpt.com',
    },
    {
      providerType: 'chatgpt',
      tokenType: 'refresh',
      label: 'Refresh Token',
      placeholder: 'OAuth refresh token (enables auto-renewal)',
      description: 'OAuth refresh token from ~/.codex/auth.json. Recommended so the adapter can refresh the access token automatically.',
      helpUrl: 'https://auth.openai.com',
    },
  ],
  gemini: [
    {
      providerType: 'gemini',
      tokenType: 'cookie',
      label: 'Cookies',
      placeholder: '__Secure-1PSID=...; __Secure-1PSIDTS=...',
      description: 'Cookies from gemini.google.com DevTools. __Secure-1PSID and __Secure-1PSIDTS are required; SID/HSID/SSID/APISID/SAPISID are needed for Pro-tier models.',
      helpUrl: 'https://gemini.google.com',
    },
  ],
  grok: [
    {
      providerType: 'grok',
      tokenType: 'cookie',
      label: 'SSO Cookies',
      placeholder: 'sso=...; sso-rw=...',
      description: 'Cookies from grok.com DevTools. `sso` is the primary SSO token; `sso-rw` is the read-write variant. Anonymous mode: x-anonuserid + x-challenge + x-signature.',
      helpUrl: 'https://grok.com',
    },
    {
      providerType: 'grok',
      tokenType: 'token',
      label: 'x-statsig-id (optional)',
      placeholder: 'Encrypted Statsig SDK token',
      description: 'Optional but recommended. The x-statsig-id header is an encrypted token produced by the in-page Statsig SDK; capture it from DevTools Network tab on grok.com.',
      helpUrl: 'https://grok.com',
    },
  ],
}

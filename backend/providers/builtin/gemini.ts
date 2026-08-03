import type { BuiltinProviderConfig } from '../../store/types'

/**
 * Google Gemini web (gemini.google.com) built-in provider.
 *
 * Authentication model: cookie-based. The two load-bearing cookies are
 * `__Secure-1PSID` (primary) and `__Secure-1PSIDTS` (rotating). For
 * Pro-tier model access, the full Google session cookie set
 * (SID/HSID/SSID/APISID/SAPISID) is also required.
 *
 * In addition to cookies, two HTML-scraped tokens are needed per session:
 *   - `SNlM0e` (CSRF / "at" form field)
 *   - `bl`    (build label, query parameter)
 * The adapter scrapes these from /app on first use and refreshes them
 * when the cookies rotate.
 *
 * Generation goes through the StreamGenerate endpoint with a
 * length-prefixed, UTF-16 framed SSE-like response.
 */
export const geminiConfig: BuiltinProviderConfig = {
  id: 'gemini',
  name: 'Gemini',
  type: 'builtin',
  authType: 'cookie',
  apiEndpoint: 'https://gemini.google.com',
  chatPath: '/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Origin': 'https://gemini.google.com',
    'Referer': 'https://gemini.google.com/',
    'X-Same-Domain': '1',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Priority': 'u=1, i',
  },
  enabled: true,
  description: 'Google Gemini web (gemini.google.com) via cookie + StreamGenerate. Supports Gemini 3 Pro/Flash/Thinking, image generation (Nano Banana / Imagen), and video generation (Veo 3).',
  supportedModels: [
    'gemini-3-pro',
    'gemini-3-flash',
    'gemini-3-flash-thinking',
    'gemini-3-pro-plus',
    'gemini-3-flash-plus',
    'gemini-3-flash-thinking-plus',
    'gemini-3-pro-image',
    'veo-3',
    'veo-3-fast',
  ],
  modelMappings: {
    'gemini-3-pro': 'gemini-3-pro',
    'gemini-3-flash': 'gemini-3-flash',
    'gemini-3-flash-thinking': 'gemini-3-flash-thinking',
    'gemini-3-pro-plus': 'gemini-3-pro-plus',
    'gemini-3-flash-plus': 'gemini-3-flash-plus',
    'gemini-3-flash-thinking-plus': 'gemini-3-flash-thinking-plus',
    'gemini-3-pro-image': 'gemini-3-pro-image',
    'veo-3': 'veo-3',
    'veo-3-fast': 'veo-3-fast',
  },
  credentialFields: [
    {
      name: 'cookie',
      label: 'Cookies',
      type: 'textarea',
      required: true,
      placeholder: '__Secure-1PSID=...; __Secure-1PSIDTS=...; SID=...; HSID=...; SSID=...; APISID=...; SAPISID=...',
      helpText: 'Cookies from gemini.google.com DevTools. __Secure-1PSID and __Secure-1PSIDTS are required; SID/HSID/SSID/APISID/SAPISID are needed for Pro-tier models.',
    },
  ],
  tokenCheckEndpoint: '/app',
  tokenCheckMethod: 'GET',
}

export default geminiConfig

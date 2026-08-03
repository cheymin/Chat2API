import type { BuiltinProviderConfig } from '../../store/types'

/**
 * Grok (grok.com) built-in provider.
 *
 * Authentication model: cookie-based. The load-bearing cookies are
 * `sso` and `sso-rw` (issued by x.com SSO after login). Anonymous
 * mode uses the `x-anonuserid` + `x-challenge` + `x-signature` cookie
 * triplet issued on first page load.
 *
 * A second dynamic header, `x-statsig-id`, is an encrypted blob
 * produced by the in-page Statsig SDK and cannot be regenerated
 * server-side. The adapter accepts it as an optional credential
 * (`statsigId`); without it, requests may be challenged.
 *
 * The web client uses NDJSON-over-SSE on
 *   POST /rest/app-chat/conversations/new
 *   POST /rest/app-chat/conversations/{id}/responses
 * Each chunk is a JSON envelope with cumulative text in
 * `modelResponse.message` (the adapter computes deltas).
 */
export const grokConfig: BuiltinProviderConfig = {
  id: 'grok',
  name: 'Grok',
  type: 'builtin',
  authType: 'cookie',
  apiEndpoint: 'https://grok.com',
  chatPath: '/rest/app-chat/conversations/new',
  headers: {
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Origin': 'https://grok.com',
    'Referer': 'https://grok.com/',
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
  description: 'Grok web (grok.com) via SSO cookie + REST app-chat. Supports Grok-4 family (always-on reasoning) and Grok Imagine / Aurora image generation.',
  supportedModels: [
    'grok-4.5',
    'grok-4.3',
    'grok-4.20-reasoning',
    'grok-4.20-non-reasoning',
    'grok-4.20-multi-agent',
    'grok-build-0.1',
    'grok-imagine',
  ],
  modelMappings: {
    'grok-4.5': 'grok-4.5',
    'grok-4.3': 'grok-4.3',
    'grok-4.20-reasoning': 'grok-4.20-0309-reasoning',
    'grok-4.20-non-reasoning': 'grok-4.20-0309-non-reasoning',
    'grok-4.20-multi-agent': 'grok-4.20-multi-agent-0309',
    'grok-build-0.1': 'grok-build-0.1',
    'grok-imagine': 'grok-imagine',
  },
  credentialFields: [
    {
      name: 'cookie',
      label: 'SSO Cookies',
      type: 'textarea',
      required: true,
      placeholder: 'sso=...; sso-rw=...',
      helpText: 'Cookies from grok.com DevTools. `sso` is the primary SSO token; `sso-rw` is the read-write variant. For anonymous mode use `x-anonuserid=...; x-challenge=...; x-signature=...`.',
    },
    {
      name: 'statsigId',
      label: 'x-statsig-id (optional)',
      type: 'textarea',
      required: false,
      placeholder: 'Encrypted Statsig SDK token captured from a logged-in browser session',
      helpText: 'Optional but recommended. The x-statsig-id header is an encrypted token produced by the in-page Statsig SDK; without it, requests may be challenged. Capture it from DevTools Network tab on grok.com.',
    },
  ],
  tokenCheckEndpoint: '/rest/rate-limits',
  tokenCheckMethod: 'POST',
}

export default grokConfig

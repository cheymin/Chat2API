import type { BuiltinProviderConfig } from '../../store/types'

/**
 * ChatGPT (chatgpt.com) built-in provider.
 *
 * Authentication model: the ChatGPT consumer web enforces a heavy
 * Sentinel + Cloudflare Turnstile + Proof-of-Work stack on the
 * classic /backend-api/conversation endpoint. The 2026-recommended
 * stable surface is the Codex CLI OAuth2 PKCE token, which talks to
 * /backend-api/codex/responses (the same Responses API the OpenAI
 * platform exposes). OpenAI officially tolerates this path for
 * Codex CLI use, so it is the safest target for an adapter.
 *
 * The OAuth token is stored in `token` (access_token) and `refreshToken`
 * (refresh_token) credential fields; the adapter refreshes automatically
 * when the access token expires.
 */
export const chatgptConfig: BuiltinProviderConfig = {
  id: 'chatgpt',
  name: 'ChatGPT',
  type: 'builtin',
  authType: 'oauth',
  apiEndpoint: 'https://chatgpt.com',
  chatPath: '/backend-api/codex/responses',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Origin': 'https://chatgpt.com',
    'OpenAI-Beta': 'responses=experimental',
    'Originator': 'codex_cli_rs',
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
  description: 'ChatGPT web (chatgpt.com) via Codex OAuth Responses API. Supports GPT-5.x family, native function calling, reasoning, image generation (gpt-image-1) and video generation (Sora 2).',
  supportedModels: [
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
    'gpt-5.5-pro',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.3-instant',
    'gpt-5.3-codex',
    'auto',
    'gpt-image-1',
    'sora-2',
    'sora-2-turbo',
  ],
  modelMappings: {
    'gpt-5.6-sol': 'gpt-5.6-sol',
    'gpt-5.6-terra': 'gpt-5.6-terra',
    'gpt-5.6-luna': 'gpt-5.6-luna',
    'gpt-5.5': 'gpt-5.5',
    'gpt-5.5-pro': 'gpt-5.5-pro',
    'gpt-5.4': 'gpt-5.4',
    'gpt-5.4-mini': 'gpt-5.4-mini',
    'gpt-5.3-instant': 'gpt-5.3-instant',
    'gpt-5.3-codex': 'gpt-5.3-codex',
    'auto': 'auto',
    'gpt-image-1': 'gpt-image-1',
    'sora-2': 'sora-2',
    'sora-2-turbo': 'sora-2-turbo',
  },
  credentialFields: [
    {
      name: 'token',
      label: 'Access Token',
      type: 'password',
      required: true,
      placeholder: 'OAuth access token (from Codex CLI ~/.codex/auth.json or openai-oauth)',
      helpText: 'OAuth2 PKCE access token issued by auth.openai.com for Codex CLI. Obtain via `npx @openai/codex login` or the openai-oauth flow.',
    },
    {
      name: 'refreshToken',
      label: 'Refresh Token',
      type: 'password',
      required: false,
      placeholder: 'OAuth refresh token (optional but recommended for auto-renewal)',
      helpText: 'OAuth refresh token. When provided, the adapter refreshes the access token automatically when it expires.',
    },
    {
      name: 'accountId',
      label: 'Account ID',
      type: 'text',
      required: false,
      placeholder: 'user-xxxx (optional, used as session_id hint)',
      helpText: 'ChatGPT account id (e.g. user-abc123). Sent as the `session_id` header on Responses API calls.',
    },
  ],
  tokenCheckEndpoint: '/backend-api/codex/responses',
  tokenCheckMethod: 'POST',
}

export default chatgptConfig

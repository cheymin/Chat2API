import type { BuiltinProviderConfig } from '../../store/types'

export const perplexityConfig: BuiltinProviderConfig = {
  id: 'perplexity',
  name: 'Perplexity',
  type: 'builtin',
  authType: 'cookie',
  apiEndpoint: 'https://www.perplexity.ai',
  chatPath: '/rest/sse/perplexity_ask',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0',
    'Accept': 'text/event-stream',
    'Content-Type': 'application/json',
    'Origin': 'https://www.perplexity.ai',
    'Referer': 'https://www.perplexity.ai/',
    'Sec-Ch-Ua': '"Microsoft Edge";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
  },
  enabled: true,
  description: 'Perplexity AI search assistant with Free Auto mode and web search enhancement',
  supportedModels: [
    'Auto',
    'PPLX-Pro',
    'PPLX-Sonar-Pro',
    'PPLX-Sonar',
    'GPT-5',
    'GPT-4.5',
    'Gemini-2.5-Pro',
    'Claude-Sonnet-4',
    'Claude-Opus-4',
    'Nemotron',
    'Grok-4',
  ],
  modelMappings: {
    'Auto': 'turbo',
    'PPLX-Pro': 'pplx_pro',
    'GPT-5': 'gpt5',
    'Gemini-2.5-Pro': 'gemini25pro',
    'Claude-Sonnet-4': 'claude4sonnet',
    'Claude-Opus-4': 'claude4opus',
    'Nemotron': 'nemotron',
  },
  credentialFields: [
    {
      name: 'sessionToken',
      label: 'Session Token',
      type: 'password',
      required: true,
      placeholder: 'Enter Perplexity session token',
      helpText: 'Session token from __Secure-next-auth.session-token cookie in browser DevTools',
    },
    {
      name: 'pplx_account',
      label: 'Account UUID (optional)',
      type: 'text',
      required: false,
      placeholder: 'e.g. db46e3aa-4b3b-479d-9746-b29a855f594e',
      helpText: 'Found in x-pplx-account header or __Host-pplx-last-active-account cookie value',
    },
  ],
}

export default perplexityConfig

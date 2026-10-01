import type { BuiltinProviderConfig } from '../../store/types'

export const kimiConfig: BuiltinProviderConfig = {
  id: 'kimi',
  name: 'Kimi',
  type: 'builtin',
  authType: 'jwt',
  apiEndpoint: 'https://www.kimi.com',
  chatPath: '/apiv2/kimi.gateway.chat.v1.ChatService/Chat',
  headers: {
    'Content-Type': 'application/connect+json',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Origin': 'https://www.kimi.com',
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
  description: 'Kimi K2.6 AI assistant by Moonshot, supports thinking mode and web search',
  supportedModels: [
    'Kimi-K3',
    'Kimi-K3-Thinking',
    'Kimi-K2.8-Preview',
    'Kimi-K2.7-Code',
    'Kimi-K2.6',
  ],
  modelMappings: {
    'Kimi-K2.6': 'kimi-k2.6',
  },
  credentialFields: [
    {
      name: 'token',
      label: '访问令牌（Access Token）',
      type: 'password',
      required: true,
      placeholder: '请输入 Kimi Access Token（以 eyJ 开头）',
      helpText: '仅支持浏览器中获取的 Kimi Access Token（JWT）。refresh_token 当前无法使用，请勿填写。',
    },
  ],
  tokenCheckEndpoint: '/api/auth/token/refresh',
  tokenCheckMethod: 'GET',
}

export default kimiConfig

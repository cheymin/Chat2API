import type { BuiltinProviderConfig } from '../../store/types'

export const deepseekConfig: BuiltinProviderConfig = {
  id: 'deepseek',
  name: 'DeepSeek',
  type: 'builtin',
  authType: 'userToken',
  apiEndpoint: 'https://chat.deepseek.com/api',
  chatPath: '/v0/chat/completion',
  headers: {
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Origin': 'https://chat.deepseek.com',
    'Referer': 'https://chat.deepseek.com/',
    // Updated to Chrome 152 fingerprint (HAR 2026-09-05)
    'Sec-Ch-Ua': '"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    // Updated UA to Chrome 152 (HAR 2026-09-05)
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
    // x-client-bundle-id added in v2.4.0 (HAR 2026-09-05), X-App-Version removed
    'X-Client-Bundle-Id': 'com.deepseek.chat',
    'X-Client-Locale': 'zh_CN',
    'X-Client-Platform': 'web',
    'X-Client-Timezone-Offset': '28800',
    // Version updated from 2.0.0 to 2.4.0 (HAR 2026-09-05)
    'X-Client-Version': '2.4.0',
  },
  enabled: true,
  description: 'DeepSeek AI assistant, supports deep thinking and web search',
  // Models updated per HAR 2026-09-05: default=快速模式, expert=专家模式, vision=识图模式(new)
  supportedModels: [
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'deepseek-v4.1-flash',
    'deepseek-v4.1-pro',
    'deepseek-v4-thinking',
    'deepseek-chat',
    'deepseek-reasoner',
  ],
  modelMappings: {
    'deepseek-v4-flash': 'deepseek-v4-flash',   // -> model_type: default (快速模式)
    'deepseek-v4-pro': 'deepseek-v4-pro',         // -> model_type: expert (专家模式)
    'deepseek-vision': 'deepseek-vision',          // -> model_type: vision (识图模式, new in v2.4.0)
    // Legacy aliases kept for backward compatibility
    'deepseek-chat': 'deepseek-v4-flash',
    'deepseek-reasoner': 'deepseek-v4-pro',
  },
  credentialFields: [
    {
      name: 'token',
      label: 'User Token',
      type: 'password',
      required: true,
      placeholder: 'Enter DeepSeek user token',
      helpText: 'Authentication token obtained from DeepSeek web version, found in browser DevTools Application -> Local Storage',
    },
  ],
  tokenCheckEndpoint: '/v0/users/current',
  tokenCheckMethod: 'GET',
}

export default deepseekConfig

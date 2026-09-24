import type { BuiltinProviderConfig } from '../../store/types'

export const glmConfig: BuiltinProviderConfig = {
  id: 'glm',
  name: 'GLM',
  type: 'builtin',
  authType: 'refresh_token',
  apiEndpoint: 'https://chatglm.cn/api',
  chatPath: '/chatglm/backend-api/assistant/stream',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
    'App-Name': 'chatglm',
    'Cache-Control': 'no-cache',
    'Origin': 'https://chatglm.cn',
    'Pragma': 'no-cache',
    'Priority': 'u=1, i',
    // Updated to Chrome 152 / Edge 152 fingerprint (HAR 2026-09-05)
    'Sec-Ch-Ua': '"Chromium";v="152", "Not?A_Brand";v="24", "Microsoft Edge";v="152"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    // x-app-fr changed from 'browser_extension' to 'default' (HAR 2026-09-05)
    'X-App-Fr': 'default',
    'X-App-Platform': 'pc',
    'X-App-Version': '0.0.1',
    'X-Device-Brand': '',
    'X-Device-Model': '',
    'X-Lang': 'zh',
  },
  enabled: true,
  description: 'Zhipu Qingyan AI assistant, supports GLM-5.3 and GLM-Flash with deep thinking and web search',
  // HAR 2026-09-05 /agent-api/operation/detail?tag=available_models.
  // Reasoning level is sent separately through `reasoning_effort`.
  supportedModels: [
    'GLM-5.3',
    'GLM-Flash',
  ],
  modelMappings: {
    'GLM-5.3': 'glm-5.3',
    'GLM-Flash': 'glm-5.3-flash',
  },
  credentialFields: [
    {
      name: 'refresh_token',
      label: 'Refresh Token',
      type: 'password',
      required: true,
      placeholder: 'Enter GLM refresh token',
      helpText: 'Get refresh_token from Zhipu Qingyan web version, found in browser DevTools Application -> Cookie -> chatglm_refresh_token',
    },
  ],
  tokenCheckEndpoint: '/chatglm/user-api/user/refresh',
  tokenCheckMethod: 'POST',
}

export default glmConfig

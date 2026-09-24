import type { BuiltinProviderConfig } from '../../store/types'

export const zaiConfig: BuiltinProviderConfig = {
  id: 'zai',
  name: 'Z.ai',
  type: 'builtin',
  authType: 'jwt',
  apiEndpoint: 'https://chat.z.ai/api',
  chatPath: '/v2/chat/completions',
  headers: {
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'zh-CN',
    'Origin': 'https://chat.z.ai',
    'Sec-Ch-Ua': '"Microsoft Edge";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'X-FE-Version': 'prod-fe-1.1.96',
    'X-Region': 'domestic',
  },
  enabled: true,
  description: 'Z.ai chat.z.ai browser channel using the current GLM-5.3 web protocol.',
  supportedModels: [
    'GLM-5.3',
    'GLM-5.3-Flash',
  ],
  modelMappings: {
    'GLM-5.3': 'glm-5.3',
    'GLM-5.3-Flash': 'glm-5.3-flash',
  },
  credentialFields: [
    {
      name: 'token',
      label: 'Access Token',
      type: 'password',
      required: true,
      placeholder: 'Enter Z.ai JWT Token',
      helpText: 'Copy the current JWT token from a successful chat.z.ai completion request.',
    },
    {
      name: 'captcha_verify_param',
      label: 'Captcha Verify Param',
      type: 'password',
      required: false,
      placeholder: 'Current captcha_verify_param from chat completion HAR',
      helpText: 'Optional short-lived verification parameter. Refresh it from a successful browser request whenever Z.ai asks for captcha verification.',
    },
  ],
  tokenCheckEndpoint: '/api/v1/users/user/settings',
  tokenCheckMethod: 'GET',
}

export default zaiConfig

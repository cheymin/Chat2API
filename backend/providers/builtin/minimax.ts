import type { BuiltinProviderConfig } from '../../store/types'

export const minimaxConfig: BuiltinProviderConfig = {
  id: 'minimax',
  name: 'MiniMax',
  type: 'builtin',
  authType: 'jwt',
  apiEndpoint: 'https://agent.minimaxi.com',
  chatPath: '/matrix/api/v1/chat/send_msg',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Cache-Control': 'no-cache',
    'Origin': 'https://agent.minimaxi.com',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  },
  enabled: true,
  description: 'MiniMax Agent - AI assistant with MCP multi-agent collaboration',
  supportedModels: [
    'MiniMax-M3',
    'MiniMax-M3-Thinking',
    'MiniMax-M2.7',
    'MiniMax-M2',
  ],
  modelMappings: {
    'MiniMax-M3': 'MiniMax-M3',
    'MiniMax-M2.7': 'MiniMax-M2.7',
  },
  credentialFields: [
    {
      name: 'token',
      label: 'JWT Token（_token）',
      type: 'password',
      required: true,
      placeholder: '粘贴以 eyJ 开头的 _token JWT',
      helpText:
        '获取方法：登录 agent.minimaxi.com 后按 F12 → Application（应用）→ Local Storage（本地存储）→ https://agent.minimaxi.com，找到 _token 并复制其 Value（值）。这里只粘贴以 eyJ 开头的 JWT 本体，不要填写 “Bearer ”、字段名或完整 Cookie。',
    },
    {
      name: 'realUserID',
      label: 'Real User ID（可选）',
      type: 'text',
      required: false,
      placeholder: 'Optional — auto-read from JWT when blank',
      helpText:
        '可留空：系统会优先从 _token 的 JWT 内自动读取用户 ID。若登录状态中的 JWT 不含此信息、使用时报“无法自动识别用户 ID”，再按 F12 → Application（应用）→ Local Storage（本地存储）→ https://agent.minimaxi.com → user_detail_agent，复制 JSON 内的 realUserID 属性值。',
    },
    {
      name: '_uetsid',
      label: '_uetsid（每日签到 Cookie）',
      type: 'password',
      required: true,
      placeholder: '粘贴 _uetsid Cookie 的值',
      helpText:
        '获取方法：保持 agent.minimaxi.com 登录状态，按 F12 → Application（应用）→ Storage（存储）→ Cookies → https://agent.minimaxi.com，找到 _uetsid 并复制其 Value（值）。这里只粘贴值本身，不要填写 “_uetsid=” 或整个 Cookie 请求头。该参数用于每日额度签到。',
    },
  ],
  tokenCheckEndpoint: '/v1/api/user/device/register',
  tokenCheckMethod: 'POST',
}

export default minimaxConfig

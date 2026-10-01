import type { BuiltinProviderConfig } from '../../store/types'

/**
 * Universal Web API Provider Configuration
 *
 * 适配自 https://github.com/lumingya/universal-web-api
 *
 * 通过 Python 驱动浏览器（DrissionPage）接管已登录的 AI 网页，
 * 转换为 OpenAI / Anthropic 兼容接口。支持 10+ 站点。
 *
 * 工作原理：provider adapter 启动 universal-web-api 子进程（通常监听 127.0.0.1:8199），
 * Chat2API 后端通过 HTTP 转发请求。首次启动会打开受控浏览器，
 * 用户需要在浏览器里登录目标 AI 网站。
 */

export const universalConfig: BuiltinProviderConfig = {
  id: 'universal',
  name: 'Universal Web API',
  type: 'builtin',
  authType: 'token',
  apiEndpoint: 'http://127.0.0.1:18199',
  chatPath: '/v1/chat/completions',
  headers: {
    'Content-Type': 'application/json',
  },
  enabled: true,
  description: 'Universal Web API 适配器 - 通过 Python 驱动浏览器连接已登录的 AI 网页（ChatGPT / DeepSeek / Gemini / Claude / Kimi / 通义千问 / Grok / 豆包 等 10+ 站点），转换为 OpenAI 兼容接口',
  supportedModels: [
    'auto',
    'chatgpt',
    'deepseek',
    'gemini',
    'claude',
    'kimi',
    'qwen',
    'grok',
    'doubao',
    'ai-studio',
    'arena',
  ],
  modelMappings: {
    'auto': 'auto',
    'chatgpt': 'chatgpt.com',
    'deepseek': 'chat.deepseek.com',
    'gemini': 'gemini.google.com',
    'claude': 'claude.ai',
    'kimi': 'www.kimi.com',
    'qwen': 'chat.qwen.ai',
    'grok': 'grok.com',
    'doubao': 'www.doubao.com',
    'ai-studio': 'aistudio.google.com',
    'arena': 'arena.ai',
  },
  credentialFields: [
    {
      name: 'apiKey',
      label: 'API Key（可选）',
      type: 'password',
      required: false,
      placeholder: '留空不校验',
      helpText: 'universal-web-api 子服务的 x-api-key，留空则不校验',
    },
    {
      name: 'pythonPath',
      label: 'Python 路径（可选）',
      type: 'text',
      required: false,
      placeholder: '留空自动检测 python3 / python',
      helpText: '可指定 Python 3.10+ 的完整路径',
    },
  ],
}

export default universalConfig

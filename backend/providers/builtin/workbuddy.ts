import type { BuiltinProviderConfig } from '../../store/types'

/**
 * WorkBuddy Provider Configuration
 * 
 * 把腾讯 WorkBuddy (www.workbuddy.ai / codebuddy.cn) 原生服务封装为
 * OpenAI 兼容接口。本项目集成了 workbuddy2api-hub 作为后端子服务，
 * provider adapter 负责启动 Python 子进程并转发请求。
 * 
 * 特性（来自 workbuddy2api-hub）：
 * - 双区域独立路由：国际版 / 国内版
 * - 多账号调度 + 设备指纹隔离
 * - OAuth 登录
 * - 国内版每日签到、成长任务、积分任务自动化
 * - 国际版每日活跃打卡领积分
 * - Web 看板（workbuddy 自带 dashboard）
 */

export const workbuddyConfig: BuiltinProviderConfig = {
  id: 'workbuddy',
  name: 'WorkBuddy',
  type: 'builtin',
  authType: 'oauth',
  apiEndpoint: 'http://127.0.0.1:18788', // 内部转发给 workbuddy 子服务
  chatPath: '/v1/chat/completions',
  headers: {
    'Content-Type': 'application/json',
  },
  enabled: true,
  description: '腾讯 WorkBuddy / CodeBuddy 适配器 - 通过内置的 workbuddy2api-hub Python 子服务实现，支持国际版与国内版双区域、多账号调度、签到积分自动化',
  supportedModels: [
    // 国际版
    'hy4-preview-f',
    'hy3',
    'deepseek-v4.1-flash',
    'gpt-6-astra',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
    'gpt-5.4',
    'grok-4.7',
    'gemini-3.5-flash',
    'glm-5.3-flash',
    'glm-5.3',
    'glm-5.2',
    'kimi-k3',
    'kimi-k2.6',
    'kimi-k2.8-preview',
    // 国内版
    'deepseek-v4-pro',
    'glm-5.1',
    'glm-5.2',
    'minimax-m3',
    'kimi-k3-1',
    'kimi-k2.7',
  ],
  modelMappings: {
    'hy4-preview-f': 'hy4-preview-f',
    'hy3': 'hy3',
    'deepseek-v4.1-flash': 'deepseek-v4.1-flash',
    'deepseek-v4-pro': 'deepseek-v4-pro',
    'gpt-6-astra': 'gpt-6-astra',
    'gpt-5.6-sol': 'gpt-5.6-sol',
    'gpt-5.6-terra': 'gpt-5.6-terra',
    'gpt-5.6-luna': 'gpt-5.6-luna',
    'gpt-5.5': 'gpt-5.5',
    'gpt-5.4': 'gpt-5.4',
    'grok-4.7': 'grok-4.7',
    'gemini-3.5-flash': 'gemini-3.5-flash',
    'glm-5.3-flash': 'glm-5.3-flash',
    'glm-5.3': 'glm-5.3',
    'glm-5.2': 'glm-5.2',
    'glm-5.1': 'glm-5.1',
    'minimax-m3': 'minimax-m3',
    'kimi-k3': 'kimi-k3',
    'kimi-k3-1': 'kimi-k3-1',
    'kimi-k2.6': 'kimi-k2.6',
    'kimi-k2.7': 'kimi-k2.7',
    'kimi-k2.8-preview': 'kimi-k2.8-preview',
  },
  credentialFields: [
    {
      name: 'realm',
      label: '默认区域',
      type: 'text',
      required: false,
      placeholder: 'intl 或 cn',
      helpText: 'intl = 国际版 (www.workbuddy.ai), cn = 国内版 (copilot.tencent.com)；留空默认 intl',
    },
    {
      name: 'apiKey',
      label: '子服务 API Key（可选）',
      type: 'password',
      required: false,
      placeholder: '留空自动生成',
      helpText: 'workbuddy2api-hub 子服务的 API Key，建议填写',
    },
    {
      name: 'pythonPath',
      label: 'Python 路径（可选）',
      type: 'text',
      required: false,
      placeholder: '留空自动检测 python3 / python',
      helpText: '可指定 Python 3.9+ 的完整路径',
    },
  ],
}

export default workbuddyConfig

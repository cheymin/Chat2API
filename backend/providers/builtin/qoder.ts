import type { BuiltinProviderConfig } from '../../store/types'

/**
 * Qoder Provider Configuration
 * 
 * Qoder 通过 CLI 二进制 (qoderclicn / qodercli) 提供服务，
 * 本 provider 通过 child_process 调用 CLI 来实现聊天请求。
 * 
 * 支持两个后端：
 * - cn:     qoderclicn (qoder.com.cn)
 * - global: qodercli   (qoder.com)
 */

export const qoderConfig: BuiltinProviderConfig = {
  id: 'qoder',
  name: 'Qoder',
  type: 'builtin',
  authType: 'token',
  apiEndpoint: 'cli://local', // 占位：Qoder 走本地 CLI，不直接走 HTTP
  chatPath: '/v1/chat/completions',
  headers: {
    'Content-Type': 'application/json',
  },
  enabled: true,
  description: 'Qoder CLI 适配器 - 通过本地 qoderclicn/qodercli 命令行工具提供服务，支持国内版与国际版双后端切换',
  supportedModels: [
    'qoder-cn',
    'auto',
    'ultimate',
    'performance',
    'efficient',
    'lite',
    'cantus',
    'qwen3.8-max',
    'qwen3.8-flash',
    'qwen3.7-max',
    'qwen3.7-plus',
    'qwen3.8-max-effort-low',
    'qwen3.8-max-effort-medium',
    'qwen3.8-max-effort-high',
    'qwen3.8-max-effort-max',
    'qwen3.7-max-effort-low',
    'qwen3.7-max-effort-medium',
    'qwen3.7-max-effort-high',
    'qwen3.7-max-effort-max',
    'kimi-k3',
    'kimi-k2.7-code',
    'glm-5.3',
    'glm-5.3-flash',
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'minimax-m3',
  ],
  modelMappings: {
    'qoder-cn': 'qoder-cn',
    'auto': 'auto',
    'ultimate': 'Ultimate',
    'performance': 'Performance',
    'efficient': 'Efficient',
    'lite': 'Lite',
    'cantus': 'Cantus',
    'qwen3.8-max': 'Qwen3.8-Max',
    'qwen3.8-flash': 'Qwen3.8-Flash',
    'qwen3.7-max': 'Qwen3.7-Max',
    'qwen3.7-plus': 'Qwen3.7-Plus',
    'kimi-k3': 'Kimi-K3',
    'kimi-k2.7-code': 'Kimi-K2.7-Code',
    'glm-5.3': 'GLM-5.3',
    'glm-5.3-flash': 'GLM-5.3-Flash',
    'deepseek-v4-pro': 'DeepSeek-V4-Pro',
    'deepseek-v4-flash': 'DeepSeek-V4-Flash',
    'minimax-m3': 'MiniMax-M3',
  },
  credentialFields: [
    {
      name: 'backend',
      label: '后端类型',
      type: 'text',
      required: true,
      placeholder: 'cn 或 global',
      helpText: 'cn = qoderclicn (国内版), global = qodercli (国际版)',
    },
    {
      name: 'token',
      label: 'Personal Access Token (仅 CN)',
      type: 'password',
      required: false,
      placeholder: 'QODERCN_PERSONAL_ACCESS_TOKEN',
      helpText: '国内版必填；国际版通过 qodercli login 登录后自动认证，无需填写',
    },
    {
      name: 'cliCommand',
      label: 'CLI 路径 (可选)',
      type: 'text',
      required: false,
      placeholder: '留空使用默认 qoderclicn / qodercli',
      helpText: '可自定义 CLI 可执行文件的完整路径',
    },
  ],
}

export default qoderConfig

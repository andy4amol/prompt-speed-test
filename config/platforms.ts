export interface PlatformConfig {
  id: string;
  name: string;
  baseUrl?: string;
  apiKeyEnv: string;
  supportedModels: string[];
  description: string;
  type: 'openai-compatible' | 'gemini';
}

export const PLATFORMS: Record<string, PlatformConfig> = {
  dashscope: {
    id: 'dashscope',
    name: '阿里百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    supportedModels: [
      'qwen-flash',
      'qwen-plus',
      'qwen-turbo',
      'qwen-max',
      'qwen3-30b-a3b-instruct-2507',
      'qwen3-235b-a22b-instruct-2507',
      'qwen3-14b',
      'qwen3-8b',
      'qwen3-4b',
      'qwen3-1.7b'
    ],
    description: '阿里百炼 Qwen 系列模型',
    type: 'openai-compatible'
  },
  doubao: {
    id: 'doubao',
    name: '火山云豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKeyEnv: 'ARK_API_KEY',
    supportedModels: [
      'doubao-seedream-4-5-251128',
      'doubao-1-5-lite-32k-250115',
      'glm-4-5-air-20250728',
      'doubao-seed-1-6-flash-250828',
      'doubao-seed-1-8-251228'
      // 其他豆包模型可在此添加
    ],
    description: '火山云豆包系列模型',
    type: 'openai-compatible'
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    apiKeyEnv: 'GEMINI_API_KEY',
    supportedModels: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ],
    description: 'Google Gemini 系列模型',
    type: 'gemini'
  }
};

export const DEFAULT_PLATFORM = 'dashscope';

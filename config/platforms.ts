export interface PlatformConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  supportedModels: string[];
  description: string;
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
    description: '阿里百炼 Qwen 系列模型'
  },
  // 预留其他平台配置位置
  // example:
  // doubao: {
  //   id: 'doubao',
  //   name: '火山云豆包',
  //   baseUrl: 'https://api.doubao.com/v1',
  //   apiKeyEnv: 'DOUBAO_API_KEY',
  //   supportedModels: [
  //     'doubao-pro',
  //     'doubao-max',
  //     // 其他豆包模型
  //   ],
  //   description: '火山云豆包系列模型'
  // },
  // gemini: {
  //   id: 'gemini',
  //   name: 'Google Gemini',
  //   baseUrl: 'https://generativelanguage.googleapis.com/v1',
  //   apiKeyEnv: 'GOOGLE_API_KEY',
  //   supportedModels: [
  //     'gemini-pro',
  //     'gemini-ultra',
  //     // 其他 Gemini 模型
  //   ],
  //   description: 'Google Gemini 系列模型'
  // }
};

export const DEFAULT_PLATFORM = 'dashscope';

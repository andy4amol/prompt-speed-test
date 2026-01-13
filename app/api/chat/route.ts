import OpenAI from 'openai';
import { StreamingTextResponse } from 'ai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../../utils/logger';
import { PLATFORMS, DEFAULT_PLATFORM } from '../../../config/platforms';
import { ProxyAgent, setGlobalDispatcher } from "undici";
// --- 代理配置核心代码 START ---
const PROXY_URL = process.env.HTTPS_PROXY || 'http://127.0.0.1:8118'; // 你的代理地址
// 仅在开发环境或显式配置了代理时启用，避免影响线上生产环境
if (process.env.NODE_ENV === 'development' || process.env.HTTPS_PROXY) {
  try {
    const dispatcher = new ProxyAgent(PROXY_URL);
    setGlobalDispatcher(dispatcher);
    console.log(`[Proxy] Global dispatcher set to ${PROXY_URL}`);
  } catch (error) {
    console.error('[Proxy] Failed to set global dispatcher:', error);
  }
}

export async function POST(req: Request) {
  // 记录请求开始时间
  const startTime = Date.now();
  let firstTokenTime: number | null = null;
  let fullResponse = '';
  
  try {
    // 解析请求体
    const body = await req.json();
    console.log('openai', body);
    // 提取用户输入
    let userPrompt = '';
    
    // 处理 useChat 钩子的请求格式
    if (body.messages && Array.isArray(body.messages)) {
      // 简单处理：只取最后一条消息的内容
      const lastMessage = body.messages[body.messages.length - 1];
      if (lastMessage && lastMessage.role === 'user') {
        // 确保内容是字符串
        userPrompt = typeof lastMessage.content === 'string' 
          ? lastMessage.content 
          : String(lastMessage.content || '');
      }
    } 
    // 处理直接 prompt 格式
    else if (body.prompt) {
      userPrompt = body.prompt;
    }
    
    if (!userPrompt.trim()) {
      return new Response(JSON.stringify({ error: 'Empty prompt' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取平台配置
    const platformId = body.platform || DEFAULT_PLATFORM;
    const platform = PLATFORMS[platformId];
    
    if (!platform) {
      return new Response(JSON.stringify({ error: `Unsupported platform: ${platformId}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取 API 密钥
    const apiKey = process.env[platform.apiKeyEnv];
    if (!apiKey) {
      return new Response(JSON.stringify({ error: `Missing API key for platform: ${platform.name}` }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 使用请求中指定的模型或默认模型（根据平台）
    const defaultModel = platform.supportedModels[0] || 'qwen-flash';
    const modelName = body.model || defaultModel;
    
    let completionStream;
    if (platform.type === 'gemini') {
       // 1. 初始化 GoogleGenerativeAI 客户端 (注意类名变化)
      const genAI = new GoogleGenerativeAI(apiKey);
      
      // 2. 获取模型实例
      const model = genAI.getGenerativeModel({ model: modelName });
      
      // 3. 调用流式接口 (注意这里是 generateContentStream)
      const result = await model.generateContentStream(userPrompt);
      
          // 4. 转换为与 OpenAI 兼容的流格式
      completionStream = {
        [Symbol.asyncIterator]: async function* () {
          let isFirstChunk = true;
          
          // 注意：Google SDK 返回的 result 包含一个 stream 属性用于迭代
          for await (const chunk of result.stream) {
            let content = '';
            
            // --- 健壮的文本提取逻辑 ---
            try {
              // 标准提取方式：调用 .text() 方法
              if (typeof chunk.text === 'function') {
                content = chunk.text();
              } 
              // 某些特殊情况或旧版本：访问 .text 属性
              else if (typeof chunk.text === 'string') {
                content = chunk.text;
              }
            } catch (e) {
              // Google SDK 在遇到安全拦截(Safety Ratings)时，调用 .text() 会抛错
              // 这里捕获错误，防止整个流中断
              console.warn('Gemini chunk text extraction skipped:', e);
            }
            // ------------------------

            if (content) {
              // 记录首 token 时间
              if (isFirstChunk) {
                firstTokenTime = Date.now();
                isFirstChunk = false;
              }
              
              // 拼接完整响应
              fullResponse += content;
              
              // 构造 OpenAI 格式的 chunk
              yield {
                choices: [{
                  delta: {
                    content: content
                  },
                  finish_reason: null
                }]
              };
            }
          }
          
          // 流结束标记
          yield {
            choices: [{
              delta: {},
              finish_reason: 'stop'
            }]
          };
        }
      };
    } else {
      // OpenAI 兼容平台处理
      // 初始化 OpenAI 客户端（兼容模式）
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: platform.baseUrl,
      });
      
      // 调用 AI 平台 API，使用流式
      completionStream = await openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        stream: true,
        temperature: 0.7,
      });
    }
    
    // 转换为 ReadableStream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        try {
          // 遍历流数据
          for await (const chunk of completionStream as any) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              // 记录首 token 时间
              if (firstTokenTime === null) {
                firstTokenTime = Date.now();
              }
              
              // 拼接完整响应
              fullResponse += content;
              
              controller.enqueue(encoder.encode(content));
            }
            
            // 检查流是否结束
            if (chunk.choices[0]?.finish_reason) {
              // 记录结束时间
              const endTime = Date.now();
              
              // 计算技术指标
              const totalTime = endTime - startTime;
              const firstTokenLatency = firstTokenTime ? firstTokenTime - startTime : null;
              const generationTime = firstTokenTime ? endTime - firstTokenTime : null;
              
              // 生成日志
              const logEntry = {
                timestamp: new Date().toISOString(),
                model: modelName,
                prompt: userPrompt,
                response: fullResponse,
                metrics: {
                  startTime: startTime,
                  firstTokenTime: firstTokenTime,
                  endTime: endTime,
                  totalTime: totalTime,
                  firstTokenLatency: firstTokenLatency,
                  generationTime: generationTime,
                  tokenCount: fullResponse.length, // 简单估算 token 数量
                  tokensPerSecond: generationTime ? Math.round(fullResponse.length / (generationTime / 1000)) : null
                }
              };
              
              // 使用异步日志记录
              logger.log(logEntry).catch(console.error);
              
              controller.close();
            }
          }
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      }
    });
    
    // 使用 StreamingTextResponse 包装，确保与 useChat 兼容
    // 注意：由于是流式响应，我们无法直接返回metrics数据
    // 前端需要通过其他方式获取准确的metrics
    return new StreamingTextResponse(stream);
    
  } catch (error: any) {
    console.error('API Error:', error);
    
    // 记录结束时间
    const endTime = Date.now();
    
    // 生成错误日志
    const logEntry = {
      timestamp: new Date().toISOString(),
      model: 'unknown',
      prompt: '',
      response: '',
      error: error.message || 'Unknown error',
      metrics: {
        startTime: startTime,
        firstTokenTime: null,
        endTime: endTime,
        totalTime: endTime - startTime,
        firstTokenLatency: null,
        generationTime: null,
        tokenCount: 0,
        tokensPerSecond: null
      }
    };
    
    // 使用异步日志记录错误
    logger.log(logEntry).catch(console.error);
    
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to generate response' 
    }), {
      status: error.status || 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
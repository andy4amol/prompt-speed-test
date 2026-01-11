'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from 'ai/react';
import { PLATFORMS, DEFAULT_PLATFORM } from '../config/platforms';

interface ProgressData {
  startTime: number;
  firstTokenTime: number | null;
  endTime: number | null;
  totalTokens: number;
}

const PromptApp = () => {
  // 平台选择状态
  const [selectedPlatform, setSelectedPlatform] = useState<string>(DEFAULT_PLATFORM);
  
  // 模型选择状态
  const [selectedModel, setSelectedModel] = useState<string>(PLATFORMS[DEFAULT_PLATFORM].supportedModels[0]);
  const [customModel, setCustomModel] = useState<string>('');
  const [useCustomModel, setUseCustomModel] = useState<boolean>(false);
  
  // 获取当前平台支持的模型
  const currentPlatformModels = PLATFORMS[selectedPlatform]?.supportedModels || [];
  
  // 获取当前使用的模型
  const getCurrentModel = () => {
    if (useCustomModel && customModel.trim()) {
      return customModel.trim();
    }
    return selectedModel;
  };
  
  const { messages, input, handleInputChange, handleSubmit, isLoading, append, setMessages } = useChat({
    api: '/api/chat',
    body: {
      model: getCurrentModel(),
      platform: selectedPlatform
    }
  });
  
  // 当平台改变时，重置模型选择
  useEffect(() => {
    setSelectedModel(PLATFORMS[selectedPlatform].supportedModels[0]);
    setUseCustomModel(false);
    setCustomModel('');
  }, [selectedPlatform]);
  
  const [progress, setProgress] = useState<ProgressData>({
    startTime: 0,
    firstTokenTime: null,
    endTime: null,
    totalTokens: 0,
  });
  
  const [responseText, setResponseText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  const handleCustomSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    // Reset progress data
    const newProgress = {
      startTime: Date.now(),
      firstTokenTime: null,
      endTime: null,
      totalTokens: 0,
    };
    setProgress(newProgress);
    setResponseText('');
    setIsStreaming(true);
    
    handleSubmit(e);
  };
  
  // Monitor messages for new responses
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        setResponseText(lastMessage.content);
        
        // Check if this is the first token
        if (progress.firstTokenTime === null && lastMessage.content.length > 0) {
          setProgress(prev => ({
            ...prev,
            firstTokenTime: Date.now(),
          }));
        }
        
        // Check if streaming has ended
        if (!isLoading && isStreaming) {
          setProgress(prev => ({
            ...prev,
            endTime: Date.now(),
          }));
          setIsStreaming(false);
        }
      }
    }
  }, [messages, isLoading, progress.firstTokenTime, isStreaming]);
  
  const calculateDuration = (start: number, end: number | null) => {
    if (!end) return 'Calculating...';
    return `${(end - start) / 1000}s`;
  };
  
  const getFirstTokenDelay = () => {
    if (!progress.firstTokenTime) return 'Waiting for first token...';
    return `${(progress.firstTokenTime - progress.startTime) / 1000}s`;
  };
  
  const getTotalTime = () => {
    if (!progress.endTime) return 'Calculating...';
    return `${(progress.endTime - progress.startTime) / 1000}s`;
  };
  
  const getStreamingTime = () => {
    if (!progress.firstTokenTime) return '0s';
    if (!progress.endTime) {
      return `${(Date.now() - progress.firstTokenTime) / 1000}s`;
    }
    return `${(progress.endTime - progress.firstTokenTime) / 1000}s`;
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8 text-center">
          <div className="flex justify-end gap-3 mb-4">
            <a 
              href="/batch" 
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              📊 批量测试
            </a>
            <a 
              href="/logs" 
              className="inline-flex items-center gap-2 bg-gray-100 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              📋 查看日志
            </a>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Prompt AI Interface</h1>
          <p className="text-gray-600">Enter your prompt and get AI responses with real-time progress tracking</p>
        </header>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Input form */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <form onSubmit={handleCustomSubmit} className="space-y-4">
                <div>
                  <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-1">
                    Your Prompt
                  </label>
                  <textarea
                    id="prompt"
                    value={input}
                    onChange={handleInputChange}
                    placeholder="Enter your prompt here..."
                    className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    disabled={isLoading}
                  />
                </div>
                
                {/* 平台选择 */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    AI 平台选择
                  </label>
                  <select
                    value={selectedPlatform}
                    onChange={(e) => setSelectedPlatform(e.target.value)}
                    disabled={isLoading}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {Object.values(PLATFORMS).map((platform) => (
                      <option key={platform.id} value={platform.id}>
                        {platform.name} - {platform.description}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* 模型选择 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    模型选择
                  </label>
                  
                  {/* 预设模型选择 */}
                  <div className="mb-3">
                    <select
                      value={selectedModel}
                      onChange={(e) => {
                        setSelectedModel(e.target.value);
                        setUseCustomModel(false);
                      }}
                      disabled={isLoading || useCustomModel}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {currentPlatformModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* 自定义模型选择 */}
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      id="use-custom-model"
                      checked={useCustomModel}
                      onChange={(e) => setUseCustomModel(e.target.checked)}
                      disabled={isLoading}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="use-custom-model" className="text-sm text-gray-700 cursor-pointer">
                      使用自定义模型
                    </label>
                  </div>
                  
                  {useCustomModel && (
                    <div>
                      <input
                        type="text"
                        id="custom-model"
                        value={customModel}
                        onChange={(e) => setCustomModel(e.target.value)}
                        placeholder="输入自定义模型名称"
                        disabled={isLoading}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        当前使用模型: {getCurrentModel()}
                      </p>
                    </div>
                  )}
                  
                  {!useCustomModel && (
                    <p className="text-xs text-gray-500 mt-1">
                      当前使用模型: {getCurrentModel()}
                    </p>
                  )}
                </div>
                
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Generating...' : 'Send Prompt'}
                </button>
              </form>
            </div>
            
            {/* Output area */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Response</h2>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 min-h-[200px] max-h-[500px] overflow-y-auto">
                {responseText ? (
                  <div className="text-gray-800 whitespace-pre-wrap">{responseText}</div>
                ) : (
                  <div className="text-gray-400 italic">{isLoading ? 'Generating response...' : 'No response yet. Enter a prompt above.'}</div>
                )}
              </div>
            </div>
          </div>
          
          {/* Progress sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-md p-6 space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Progress Tracking</h2>
              
              <div className="space-y-4">
                {/* Start time */}
                <div>
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Start Time</span>
                    <span>{progress.startTime ? new Date(progress.startTime).toLocaleTimeString() : '-'}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    {isStreaming && (
                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: '100%' }}></div>
                    )}
                  </div>
                </div>
                
                {/* First token time */}
                <div>
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>First Token Delay</span>
                    <span>{getFirstTokenDelay()}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    {progress.firstTokenTime && (
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: '100%' }}></div>
                    )}
                  </div>
                </div>
                
                {/* Response generation time */}
                <div>
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Generation Time</span>
                    <span>{getStreamingTime()}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    {isStreaming && progress.firstTokenTime && (
                      <div 
                        className="bg-purple-500 h-2 rounded-full" 
                        style={{ 
                          width: '100%',
                          opacity: 0.7
                        }}
                      ></div>
                    )}
                    {!isStreaming && progress.firstTokenTime && progress.endTime && (
                      <div className="bg-purple-500 h-2 rounded-full" style={{ width: '100%' }}></div>
                    )}
                  </div>
                </div>
                
                {/* Total time */}
                <div>
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Total Response Time</span>
                    <span>{getTotalTime()}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    {!isStreaming && progress.endTime && (
                      <div className="bg-orange-500 h-2 rounded-full" style={{ width: '100%' }}></div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Progress summary */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Performance Metrics</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">First Token Latency:</span>
                    <span className="font-medium">{getFirstTokenDelay()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Generation Speed:</span>
                    <span className="font-medium">{progress.totalTokens > 0 && progress.firstTokenTime && progress.endTime 
                      ? `${Math.round(progress.totalTokens / ((progress.endTime - progress.firstTokenTime) / 1000))} tokens/s` 
                      : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Time:</span>
                    <span className="font-medium">{getTotalTime()}</span>
                  </div>
                </div>
              </div>
              
              {/* Status indicator */}
              <div className="flex items-center justify-center p-4 rounded-lg">
                <div className={`w-3 h-3 rounded-full mr-2 ${isStreaming ? 'bg-blue-500 animate-pulse' : progress.endTime ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                <span className="text-sm font-medium text-gray-700">
                  {isStreaming ? 'Streaming Response...' : progress.endTime ? 'Completed' : 'Ready'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromptApp;
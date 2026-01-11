'use client';

import { useState, useRef, useEffect } from 'react';
import { PLATFORMS, DEFAULT_PLATFORM } from '../../config/platforms';

type ModelType = string;

interface BatchTestResult {
  id: string;
  variable: string;
  model: string;
  prompt: string;
  response: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
  startTime: number;
  firstTokenTime: number | null;
  endTime?: number;
}

export default function BatchTestPage() {
  // 平台选择状态
  const [selectedPlatform, setSelectedPlatform] = useState<string>(DEFAULT_PLATFORM);
  
  // 模型选择状态
  const [selectedModel, setSelectedModel] = useState<string>(PLATFORMS[DEFAULT_PLATFORM].supportedModels[0]);
  const [customModel, setCustomModel] = useState<string>('');
  const [useCustomModel, setUseCustomModel] = useState<boolean>(false);
  
  const [promptTemplate, setPromptTemplate] = useState('请介绍一下 {variable}');
  const [variablesText, setVariablesText] = useState('北京\n上海\n广州\n深圳');
  const [results, setResults] = useState<BatchTestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [testId, setTestId] = useState<string>('');
  
  // 获取当前平台支持的模型
  const currentPlatformModels = PLATFORMS[selectedPlatform]?.supportedModels || [];
  
  // 获取当前使用的模型
  const getCurrentModel = () => {
    if (useCustomModel && customModel.trim()) {
      return customModel.trim();
    }
    return selectedModel;
  };
  
  // 当平台改变时，重置模型选择
  useEffect(() => {
    setSelectedModel(PLATFORMS[selectedPlatform].supportedModels[0]);
    setUseCustomModel(false);
    setCustomModel('');
  }, [selectedPlatform]);
  
  const runBatchTest = async () => {
    if (isRunning) return;
    
    // 解析变量列表
    const variables = variablesText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    if (variables.length === 0) {
      alert('请输入至少一个测试变量');
      return;
    }
    
    // 创建测试ID
    const newTestId = `batch_${Date.now()}`;
    setTestId(newTestId);
    
    // 获取当前使用的模型
    const currentModel = getCurrentModel();
    
    // 记录批次开始时间
    const batchStartTime = Date.now();
    
    // 初始化结果
    const initialResults: BatchTestResult[] = variables.map((variable, index) => ({
      id: `${newTestId}_${index}`,
      variable: variable,
      model: currentModel,
      prompt: promptTemplate.replace('{variable}', variable),
      response: '',
      status: 'pending',
      firstTokenTime: null,
      startTime: 0 // 初始化为0，稍后在运行时设置
    }));
    
    setResults(initialResults);
    setIsRunning(true);
    
    try {
      // 依次运行每个测试
      for (let i = 0; i < variables.length; i++) {
        const variable = variables[i];
        const resultIndex = i;
        
        // 设置当前测试的开始时间
        const caseStartTime = Date.now();
        
        // 更新状态为运行中并设置开始时间
        setResults(prev => prev.map((r, idx) => 
          idx === resultIndex ? { ...r, status: 'running', startTime: caseStartTime } : r
        ));
        
        // 强制重新渲染以确保开始时间被正确设置
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // 调用API，传递当前平台和模型
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: promptTemplate.replace('{variable}', variable),
            model: currentModel,
            platform: selectedPlatform
          })
        });
        
        if (!response.ok) {
          // 更新状态为错误
          setResults(prev => {
            const updatedResults = prev.map((r, idx) => 
              idx === resultIndex ? {
                ...r, 
                status: 'error' as const,
                error: `API 调用失败: ${response.status}`,
                endTime: Date.now()
              } : r
            );
            
            // 保存结果到本地存储
            localStorage.setItem(newTestId, JSON.stringify(updatedResults));
            return updatedResults;
          });
          continue;
        }
        
        // 读取流式响应
        const reader = response.body?.getReader();
        if (!reader) {
          // 更新状态为错误
          setResults(prev => {
            const updatedResults = prev.map((r, idx) => 
              idx === resultIndex ? {
                ...r, 
                status: 'error' as const,
                error: '无响应内容',
                endTime: Date.now()
              } : r
            );
            
            localStorage.setItem(newTestId, JSON.stringify(updatedResults));
            return updatedResults;
          });
          continue;
        }
        
        const decoder = new TextDecoder();
        let responseText = '';
        let firstTokenReceived = false;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunkText = decoder.decode(value, { stream: true });
          responseText += chunkText;
          
          // 记录首 token 时间
          if (!firstTokenReceived) {
            firstTokenReceived = true;
            setResults(prev => prev.map((r, idx) => 
              idx === resultIndex ? { ...r, firstTokenTime: Date.now() } : r
            ));
          }
          
          // 更新实时响应
          setResults(prev => prev.map((r, idx) => 
            idx === resultIndex ? { ...r, response: responseText } : r
          ));
        }
        
        // 更新状态为完成
        setResults(prev => {
          const updatedResults = prev.map((r, idx) => 
            idx === resultIndex ? {
              ...r, 
              status: 'completed' as const,
              endTime: Date.now()
            } : r
          );
          
          // 保存结果到本地存储
          localStorage.setItem(newTestId, JSON.stringify(updatedResults));
          return updatedResults;
        });
      }
      
    } catch (error) {
      console.error('Batch test failed:', error);
      setResults(prev => {
        const updatedResults = prev.map(r => 
          r.status === 'running' ? {
            ...r, 
            status: 'error' as const,
            error: error instanceof Error ? error.message : 'Unknown error',
            endTime: Date.now()
          } : r
        );
        
        // 保存结果到本地存储
        if (testId) {
          localStorage.setItem(testId, JSON.stringify(updatedResults));
        }
        return updatedResults;
      });
    } finally {
      setIsRunning(false);
      
      // 计算批次持续时间
      const batchEndTime = Date.now();
      const duration = batchEndTime - batchStartTime;
      
      // 记录批次结果到日志系统
      try {
        await fetch('/api/log-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            testId: newTestId,
            promptTemplate: promptTemplate,
            variables: variables,
            model: getCurrentModel(),
            platform: selectedPlatform,
            results: results,
            timestamp: new Date(batchStartTime).toISOString(),
            duration: duration
          })
        });
        console.log('Batch results logged successfully');
      } catch (logError) {
        console.error('Failed to log batch results:', logError);
      }
    }
  };
  
  const viewResults = () => {
    if (testId) {
      window.location.href = `/batch/results?testId=${testId}`;
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold text-gray-900">批量验证</h1>
            {testId && (
              <button
                onClick={viewResults}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                📊 查看详细结果
              </button>
            )}
          </div>
          <p className="text-gray-600">
            创建prompt模板，输入多个变量值，批量测试AI响应
          </p>
        </header>
        
        <div className="grid grid-cols-1 gap-6">
          {/* 输入区域 */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">测试配置</h2>
            
            <div className="space-y-6">
              {/* Prompt模板 */}
              <div>
                <label htmlFor="prompt-template" className="block text-sm font-medium text-gray-700 mb-2">
                  Prompt模板（使用 {'{variable}'} 作为变量占位符）
                </label>
                <textarea
                  id="prompt-template"
                  value={promptTemplate}
                  onChange={(e) => setPromptTemplate(e.target.value)}
                  placeholder="请介绍一下 {variable}"
                  className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  disabled={isRunning}
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
                  disabled={isRunning}
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
                    disabled={isRunning || useCustomModel}
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
                    disabled={isRunning}
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
                      disabled={isRunning}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      当前使用模型: {customModel.trim() || '请输入模型名称'}
                    </p>
                  </div>
                )}
                
                {!useCustomModel && (
                  <p className="text-xs text-gray-500 mt-1">
                    当前使用模型: {selectedModel}
                  </p>
                )}
                
                <p className="text-xs text-gray-500 mt-2">
                  提示: 默认使用当前平台的第一个模型，可从列表选择或输入自定义模型
                </p>
              </div>
              
              {/* 变量列表 */}
              <div>
                <label htmlFor="variables" className="block text-sm font-medium text-gray-700 mb-2">
                  变量列表（每行一个值）
                </label>
                <textarea
                  id="variables"
                  value={variablesText}
                  onChange={(e) => setVariablesText(e.target.value)}
                  placeholder="北京\n上海\n广州\n深圳"
                  className="w-full h-40 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  disabled={isRunning}
                />
                <p className="text-sm text-gray-500 mt-1">
                  共 {variablesText.split('\n').filter(line => line.trim().length > 0).length} 个测试变量
                </p>
              </div>
              
              {/* 操作按钮 */}
              <div className="flex gap-4">
                <button
                  onClick={runBatchTest}
                  disabled={isRunning}
                  className="bg-blue-600 text-white py-3 px-8 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isRunning ? '测试中...' : '开始测试'}
                </button>
                
                <button
                  onClick={() => {
                    setResults([]);
                    setTestId('');
                  }}
                  disabled={isRunning}
                  className="bg-gray-100 text-gray-800 py-3 px-8 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:bg-gray-200 disabled:cursor-not-allowed"
                >
                  清空结果
                </button>
              </div>
            </div>
          </div>
          
          {/* 结果输出区域 */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">测试结果</h2>
            
            {results.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                点击"开始测试"后将显示结果
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {results.map((result, index) => (
                  <div 
                    key={result.id} 
                    className={`border rounded-lg p-4 ${result.status === 'error' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
                  >
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">
                          测试 {index + 1}: {result.variable}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${result.status === 'completed' ? 'bg-green-100 text-green-800' : result.status === 'running' ? 'bg-blue-100 text-blue-800' : result.status === 'error' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                          {result.status === 'pending' && '等待中'}
                          {result.status === 'running' && '运行中'}
                          {result.status === 'completed' && '已完成'}
                          {result.status === 'error' && '失败'}
                        </span>
                        <span className="bg-gray-100 text-gray-800 px-2.5 py-0.5 rounded-full text-xs font-medium">
                          模型: {result.model}
                        </span>
                      </div>
                      
                      {/* 时间信息 */}
                      <div className="flex flex-col gap-1 text-xs text-gray-500">
                        <div>总耗时: {result.endTime && result.startTime ? `${result.endTime - result.startTime}ms` : '-'}</div>
                        {result.firstTokenTime && result.startTime && (
                          <div>首token: {result.firstTokenTime - result.startTime}ms</div>
                        )}
                        {result.endTime && result.firstTokenTime && (
                          <div>生成: {result.endTime - result.firstTokenTime}ms</div>
                        )}
                      </div>
                    </div>
                    
                    {/* Prompt 信息 */}
                    <div className="mb-3">
                      <h3 className="text-xs font-semibold text-gray-700 mb-1">Prompt:</h3>
                      <div className="bg-white border border-gray-200 rounded p-3 text-sm text-gray-800 max-h-16 overflow-y-auto">
                        {result.prompt}
                      </div>
                    </div>
                    
                    {/* Response 信息 */}
                    <div>
                      <h3 className="text-xs font-semibold text-gray-700 mb-1">Response:</h3>
                      <div className="bg-white border border-gray-200 rounded p-3 text-sm text-gray-800 whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {result.error ? (
                          <span className="text-red-600">错误: {result.error}</span>
                        ) : (
                          result.response || '等待响应...'
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
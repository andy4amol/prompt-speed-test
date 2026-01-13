'use client';

import { useState } from 'react';
import { PLATFORMS, DEFAULT_PLATFORM } from '../../../config/platforms';

interface BatchTestResult {
  id: string;
  variable: string;
  prompt: string;
  response: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
  startTime: number;
  firstTokenTime: number | null;
  endTime?: number;
}

interface CompareResult {
  id: string;
  variable: string;
  prompt: string;
  models: string[]; // 最多三个模型名称
  results: BatchTestResult[]; // 最多三个模型结果
}

interface ModelConfig {
  platform: string;
  model: string;
  customModel: string;
  useCustomModel: boolean;
}

// 支持最多三个模型
type ModelIndex = 1 | 2 | 3;

export default function BatchComparePage() {
  // Prompt模板和变量
  const [promptTemplate, setPromptTemplate] = useState('请介绍一下 {variable}');
  const [variablesText, setVariablesText] = useState('北京\n上海\n广州\n深圳');
  
  // 模型配置 - 支持最多三个模型
  const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([
    // 模型1
    {
      platform: DEFAULT_PLATFORM,
      model: PLATFORMS[DEFAULT_PLATFORM].supportedModels[0],
      customModel: '',
      useCustomModel: false
    },
    // 模型2
    {
      platform: DEFAULT_PLATFORM,
      model: PLATFORMS[DEFAULT_PLATFORM].supportedModels[1] || PLATFORMS[DEFAULT_PLATFORM].supportedModels[0],
      customModel: '',
      useCustomModel: false
    },
    // 模型3
    {
      platform: DEFAULT_PLATFORM,
      model: PLATFORMS[DEFAULT_PLATFORM].supportedModels[2] || PLATFORMS[DEFAULT_PLATFORM].supportedModels[0],
      customModel: '',
      useCustomModel: false
    }
  ]);
  
  // 控制显示的模型数量（1-3）
  const [modelCount, setModelCount] = useState<2 | 3>(2); // 默认显示2个模型
  
  // 测试结果
  const [results, setResults] = useState<CompareResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [testId, setTestId] = useState<string>('');
  
  // 获取当前使用的模型
  const getCurrentModel = (config: ModelConfig) => {
    if (config.useCustomModel && config.customModel.trim()) {
      return config.customModel.trim();
    }
    return config.model;
  };
  
  // 运行对比测试
  const runCompareTest = async () => {
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
    const newTestId = `compare_${Date.now()}`;
    setTestId(newTestId);
    
    // 获取当前使用的模型
    const models = modelConfigs.slice(0, modelCount).map(config => getCurrentModel(config));
    
    // 记录批次开始时间
    const batchStartTime = Date.now();
    
    // 初始化结果
    const initialResults: CompareResult[] = variables.map((variable, index) => {
      const baseId = `${newTestId}_${index}`;
      const prompt = promptTemplate.replace('{variable}', variable);
      
      // 初始化每个模型的结果
      const initialModelResults: BatchTestResult[] = models.map((model, modelIdx) => ({
        id: `${baseId}_model${modelIdx + 1}`,
        variable: variable,
        prompt: prompt,
        response: '',
        status: 'pending',
        firstTokenTime: null,
        startTime: 0
      }));
      
      return {
        id: baseId,
        variable: variable,
        prompt: prompt,
        models: models,
        results: initialModelResults
      };
    });
    
    setResults(initialResults);
    setIsRunning(true);
    
    try {
      // 依次运行每个测试
      for (let i = 0; i < variables.length; i++) {
        const variable = variables[i];
        const resultIndex = i;
        const prompt = promptTemplate.replace('{variable}', variable);
        
        // 并行运行所有模型的测试
        const testPromises = [];
        for (let modelIdx = 0; modelIdx < modelCount; modelIdx++) {
          testPromises.push(runSingleModelTest(newTestId, resultIndex, prompt, variable, (modelIdx + 1) as ModelIndex));
        }
        
        await Promise.all(testPromises);
      }
      
    } catch (error) {
      console.error('Compare test failed:', error);
      // 更新所有运行中模型的状态为错误
      setResults(prev => prev.map(result => ({
        ...result,
        results: result.results.map(r => r.status === 'running' ? {
          ...r,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          endTime: Date.now()
        } : r)
      })));
    } finally {
      setIsRunning(false);
    }
  };
  
  // 运行单个模型的测试
  const runSingleModelTest = async (
    testId: string,
    resultIndex: number,
    prompt: string,
    variable: string,
    modelIndex: ModelIndex
  ) => {
    const config = modelConfigs[modelIndex - 1];
    const model = getCurrentModel(config);
    
    // 设置当前测试的开始时间
    const caseStartTime = Date.now();
    
    // 更新状态为运行中
    setResults(prev => prev.map((r, idx) => {
      if (idx === resultIndex) {
        return {
          ...r,
          results: r.results.map((res, resIdx) => {
            if (resIdx === modelIndex - 1) {
              return {
                ...res,
                status: 'running',
                startTime: caseStartTime
              };
            }
            return res;
          })
        };
      }
      return r;
    }));
    
    try {
      // 调用API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt,
          model: model,
          platform: config.platform
        })
      });
      
      if (!response.ok) {
        // 更新状态为错误
        setResults(prev => prev.map((r, idx) => {
          if (idx === resultIndex) {
            return {
              ...r,
              results: r.results.map((res, resIdx) => {
                if (resIdx === modelIndex - 1) {
                  return {
                    ...res,
                    status: 'error',
                    error: `API 调用失败: ${response.status}`,
                    endTime: Date.now()
                  };
                }
                return res;
              })
            };
          }
          return r;
        }));
        return;
      }
      
      // 读取流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        setResults(prev => prev.map((r, idx) => {
          if (idx === resultIndex) {
            return {
              ...r,
              results: r.results.map((res, resIdx) => {
                if (resIdx === modelIndex - 1) {
                  return {
                    ...res,
                    status: 'error',
                    error: '无响应内容',
                    endTime: Date.now()
                  };
                }
                return res;
              })
            };
          }
          return r;
        }));
        return;
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
          setResults(prev => prev.map((r, idx) => {
            if (idx === resultIndex) {
              return {
                ...r,
                results: r.results.map((res, resIdx) => {
                  if (resIdx === modelIndex - 1) {
                    return {
                      ...res,
                      firstTokenTime: Date.now()
                    };
                  }
                  return res;
                })
              };
            }
            return r;
          }));
        }
        
        // 更新实时响应
        setResults(prev => prev.map((r, idx) => {
          if (idx === resultIndex) {
            return {
              ...r,
              results: r.results.map((res, resIdx) => {
                if (resIdx === modelIndex - 1) {
                  return {
                    ...res,
                    response: responseText
                  };
                }
                return res;
              })
            };
          }
          return r;
        }));
      }
      
      // 更新状态为完成
      setResults(prev => prev.map((r, idx) => {
        if (idx === resultIndex) {
          return {
            ...r,
            results: r.results.map((res, resIdx) => {
              if (resIdx === modelIndex - 1) {
                return {
                  ...res,
                  status: 'completed',
                  endTime: Date.now()
                };
              }
              return res;
            })
          };
        }
        return r;
      }));
      
    } catch (error) {
      // 更新状态为错误
      setResults(prev => prev.map((r, idx) => {
        if (idx === resultIndex) {
          return {
            ...r,
            results: r.results.map((res, resIdx) => {
              if (resIdx === modelIndex - 1) {
                return {
                  ...res,
                  status: 'error',
                  error: error instanceof Error ? error.message : 'Unknown error',
                  endTime: Date.now()
                };
              }
              return res;
            })
          };
        }
        return r;
      }));
    }
  };
  
  // 计算性能指标
  const calculateMetrics = (result: BatchTestResult) => {
    const totalTime = result.endTime && result.startTime ? result.endTime - result.startTime : 0;
    const firstTokenLatency = result.firstTokenTime && result.startTime ? result.firstTokenTime - result.startTime : null;
    const generationTime = result.endTime && result.firstTokenTime ? result.endTime - result.firstTokenTime : null;
    
    return {
      totalTime,
      firstTokenLatency,
      generationTime,
      tokensPerSecond: generationTime ? Math.round(result.response.length / (generationTime / 1000)) : null
    };
  };
  
  // 下载对比报告
  const downloadReport = () => {
    // 生成报告内容
    let report = `模型对比报告\n`;
    report += `=================\n\n`;
    report += `Prompt模板: ${promptTemplate}\n\n`;
    
    // 添加模型信息
    const currentModels = modelConfigs.slice(0, modelCount).map((config, idx) => ({
      name: getCurrentModel(config),
      platform: config.platform
    }));
    
    currentModels.forEach((model, idx) => {
      report += `模型${idx + 1}: ${model.name} (${model.platform})\n`;
    });
    report += `\n`;
    
    // 整体对比
    report += `整体对比\n`;
    report += `----------\n`;
    
    // 初始化统计数据
    const totalTimes = Array(modelCount).fill(0);
    const firstTokens = Array(modelCount).fill(0);
    let completedCount = 0;
    
    results.forEach(result => {
      const allCompleted = result.results.every(r => r.status === 'completed');
      if (allCompleted) {
        result.results.forEach((res, idx) => {
          const metrics = calculateMetrics(res);
          totalTimes[idx] += metrics.totalTime;
          if (metrics.firstTokenLatency) firstTokens[idx] += metrics.firstTokenLatency;
        });
        completedCount++;
      }
    });
    
    if (completedCount > 0) {
      report += `平均总耗时: `;
      report += totalTimes.map((time, idx) => `模型${idx + 1} ${(time / completedCount).toFixed(0)}ms`).join(' | ');
      report += `\n`;
      
      report += `平均首Token延迟: `;
      report += firstTokens.map((latency, idx) => `模型${idx + 1} ${(latency / completedCount).toFixed(0)}ms`).join(' | ');
      report += `\n\n`;
    }
    
    // 详细结果
    report += `详细结果\n`;
    report += `----------\n\n`;
    
    results.forEach((result, index) => {
      report += `测试 ${index + 1}: ${result.variable}\n`;
      report += `Prompt: ${result.prompt}\n`;
      report += `\n`;
      
      // 每个模型的结果
      result.results.forEach((res, idx) => {
        report += `模型${idx + 1} - ${result.models[idx]}:\n`;
        report += `状态: ${res.status === 'completed' ? '成功' : res.status === 'error' ? '失败' : '未完成'}\n`;
        if (res.status === 'completed') {
          const metrics = calculateMetrics(res);
          report += `总耗时: ${metrics.totalTime}ms\n`;
          report += `首Token延迟: ${metrics.firstTokenLatency}ms\n`;
          report += `生成速度: ${metrics.tokensPerSecond || 0} tokens/s\n`;
        } else if (res.status === 'error') {
          report += `错误: ${res.error}\n`;
        }
        report += `响应: ${res.response.substring(0, 100)}${res.response.length > 100 ? '...' : ''}\n`;
        report += `\n`;
      });
      
      report += `----------------------------------------\n\n`;
    });
    
    // 创建下载链接
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `model-compare-report-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  // 清空结果
  const clearResults = () => {
    setResults([]);
    setTestId('');
  };

  // 计算整体性能指标
  const totalMetrics = results.length > 0 ? results.reduce((acc, result) => {
    result.results.forEach((res, idx) => {
      if (res.status === 'completed') {
        const metrics = calculateMetrics(res);
        acc[idx].totalTime += metrics.totalTime;
        if (metrics.firstTokenLatency) {
          acc[idx].firstTokenLatency += metrics.firstTokenLatency;
        }
        acc[idx].completedCount++;
      }
    });
    return acc;
  }, Array(modelCount).fill(0).map(() => ({
    totalTime: 0,
    firstTokenLatency: 0,
    completedCount: 0
  }))) : Array(modelCount).fill(0).map(() => ({
    totalTime: 0,
    firstTokenLatency: 0,
    completedCount: 0
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold text-gray-900">模型对比测试</h1>
            {results.length > 0 && (
              <button
                onClick={downloadReport}
                disabled={isRunning}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
              >
                📥 下载报告
              </button>
            )}
          </div>
          <p className="text-gray-600">
            创建prompt模板，输入多个变量值，同时测试最多三个不同模型的响应并进行对比
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
              
              {/* 模型数量选择 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  模型数量
                </label>
                <div className="flex gap-4">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="model-count"
                      value={2}
                      checked={modelCount === 2}
                      onChange={(e) => setModelCount(2 as 2 | 3)}
                      disabled={isRunning}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">2个模型</span>
                  </label>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="model-count"
                      value={3}
                      checked={modelCount === 3}
                      onChange={(e) => setModelCount(3 as 2 | 3)}
                      disabled={isRunning}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">3个模型</span>
                  </label>
                </div>
              </div>
              
              {/* 模型配置 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 模型1配置 */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">模型1</h3>
                  
                  {/* 平台选择 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      AI 平台选择
                    </label>
                    <select
                      value={modelConfigs[0].platform}
                      onChange={(e) => {
                        const platform = e.target.value;
                        setModelConfigs(prev => [
                          {
                            ...prev[0],
                            platform,
                            model: PLATFORMS[platform].supportedModels[0],
                            useCustomModel: false
                          },
                          ...prev.slice(1)
                        ]);
                      }}
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
                        value={modelConfigs[0].model}
                        onChange={(e) => {
                          setModelConfigs(prev => [
                            {
                              ...prev[0],
                              model: e.target.value,
                              useCustomModel: false
                            },
                            ...prev.slice(1)
                          ]);
                        }}
                        disabled={isRunning || modelConfigs[0].useCustomModel}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        {PLATFORMS[modelConfigs[0].platform].supportedModels.map((model) => (
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
                        id="model1-use-custom"
                        checked={modelConfigs[0].useCustomModel}
                        onChange={(e) => {
                          setModelConfigs(prev => [
                            {
                              ...prev[0],
                              useCustomModel: e.target.checked
                            },
                            ...prev.slice(1)
                          ]);
                        }}
                        disabled={isRunning}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="model1-use-custom" className="text-sm text-gray-700 cursor-pointer">
                        使用自定义模型
                      </label>
                    </div>
                    
                    {modelConfigs[0].useCustomModel && (
                      <div>
                        <input
                          type="text"
                          id="model1-custom"
                          value={modelConfigs[0].customModel}
                          onChange={(e) => {
                            setModelConfigs(prev => [
                              {
                                ...prev[0],
                                customModel: e.target.value
                              },
                              ...prev.slice(1)
                            ]);
                          }}
                          placeholder="输入自定义模型名称"
                          disabled={isRunning}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          当前使用模型: {modelConfigs[0].customModel.trim() || '请输入模型名称'}
                        </p>
                      </div>
                    )}
                    
                    {!modelConfigs[0].useCustomModel && (
                      <p className="text-xs text-gray-500 mt-1">
                        当前使用模型: {modelConfigs[0].model}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* 模型2配置 */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">模型2</h3>
                  
                  {/* 平台选择 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      AI 平台选择
                    </label>
                    <select
                      value={modelConfigs[1].platform}
                      onChange={(e) => {
                        const platform = e.target.value;
                        setModelConfigs(prev => [
                          prev[0],
                          {
                            ...prev[1],
                            platform,
                            model: PLATFORMS[platform].supportedModels[0],
                            useCustomModel: false
                          },
                          ...prev.slice(2)
                        ]);
                      }}
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
                        value={modelConfigs[1].model}
                        onChange={(e) => {
                          setModelConfigs(prev => [
                            prev[0],
                            {
                              ...prev[1],
                              model: e.target.value,
                              useCustomModel: false
                            },
                            ...prev.slice(2)
                          ]);
                        }}
                        disabled={isRunning || modelConfigs[1].useCustomModel}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        {PLATFORMS[modelConfigs[1].platform].supportedModels.map((model) => (
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
                        id="model2-use-custom"
                        checked={modelConfigs[1].useCustomModel}
                        onChange={(e) => {
                          setModelConfigs(prev => [
                            prev[0],
                            {
                              ...prev[1],
                              useCustomModel: e.target.checked
                            },
                            ...prev.slice(2)
                          ]);
                        }}
                        disabled={isRunning}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="model2-use-custom" className="text-sm text-gray-700 cursor-pointer">
                        使用自定义模型
                      </label>
                    </div>
                    
                    {modelConfigs[1].useCustomModel && (
                      <div>
                        <input
                          type="text"
                          id="model2-custom"
                          value={modelConfigs[1].customModel}
                          onChange={(e) => {
                            setModelConfigs(prev => [
                              prev[0],
                              {
                                ...prev[1],
                                customModel: e.target.value
                              },
                              ...prev.slice(2)
                            ]);
                          }}
                          placeholder="输入自定义模型名称"
                          disabled={isRunning}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          当前使用模型: {modelConfigs[1].customModel.trim() || '请输入模型名称'}
                        </p>
                      </div>
                    )}
                    
                    {!modelConfigs[1].useCustomModel && (
                      <p className="text-xs text-gray-500 mt-1">
                        当前使用模型: {modelConfigs[1].model}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* 模型3配置 */}
                {(modelCount === 3) && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-medium text-gray-900 mb-3">模型3</h3>
                    
                    {/* 平台选择 */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        AI 平台选择
                      </label>
                      <select
                        value={modelConfigs[2].platform}
                        onChange={(e) => {
                          const platform = e.target.value;
                          setModelConfigs(prev => [
                            prev[0],
                            prev[1],
                            {
                              ...prev[2],
                              platform,
                              model: PLATFORMS[platform].supportedModels[0],
                              useCustomModel: false
                            }
                          ]);
                        }}
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
                          value={modelConfigs[2].model}
                          onChange={(e) => {
                            setModelConfigs(prev => [
                              prev[0],
                              prev[1],
                              {
                                ...prev[2],
                                model: e.target.value,
                                useCustomModel: false
                              }
                            ]);
                          }}
                          disabled={isRunning || modelConfigs[2].useCustomModel}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          {PLATFORMS[modelConfigs[2].platform].supportedModels.map((model) => (
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
                          id="model3-use-custom"
                          checked={modelConfigs[2].useCustomModel}
                          onChange={(e) => {
                            setModelConfigs(prev => [
                              prev[0],
                              prev[1],
                              {
                                ...prev[2],
                                useCustomModel: e.target.checked
                              }
                            ]);
                          }}
                          disabled={isRunning}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="model3-use-custom" className="text-sm text-gray-700 cursor-pointer">
                          使用自定义模型
                        </label>
                      </div>
                      
                      {modelConfigs[2].useCustomModel && (
                        <div>
                          <input
                            type="text"
                            id="model3-custom"
                            value={modelConfigs[2].customModel}
                            onChange={(e) => {
                              setModelConfigs(prev => [
                                prev[0],
                                prev[1],
                                {
                                  ...prev[2],
                                  customModel: e.target.value
                                }
                              ]);
                            }}
                            placeholder="输入自定义模型名称"
                            disabled={isRunning}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            当前使用模型: {modelConfigs[2].customModel.trim() || '请输入模型名称'}
                          </p>
                        </div>
                      )}
                      
                      {!modelConfigs[2].useCustomModel && (
                        <p className="text-xs text-gray-500 mt-1">
                          当前使用模型: {modelConfigs[2].model}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* 操作按钮 */}
              <div className="flex gap-4">
                <button
                  onClick={runCompareTest}
                  disabled={isRunning}
                  className="bg-blue-600 text-white py-3 px-8 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isRunning ? '测试中...' : '开始对比测试'}
                </button>
                
                <button
                  onClick={clearResults}
                  disabled={isRunning}
                  className="bg-gray-100 text-gray-800 py-3 px-8 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:bg-gray-200 disabled:cursor-not-allowed"
                >
                  清空结果
                </button>
              </div>
            </div>
          </div>
          
          {/* 结果输出区域 */}
          {results.length > 0 && (
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">对比结果</h2>
              
              {/* 整体对比 */}
              <div className="mb-6 border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h3 className="text-lg font-medium text-gray-900 mb-3">整体性能对比</h3>
                
                <div className={`grid grid-cols-1 md:grid-cols-${modelCount} gap-4`}>
                  {modelConfigs.slice(0, modelCount).map((config, idx) => {
                    const metrics = totalMetrics[idx];
                    const avgTotalTime = metrics.completedCount > 0 ? Math.round(metrics.totalTime / metrics.completedCount) : 0;
                    const avgFirstToken = metrics.completedCount > 0 ? Math.round(metrics.firstTokenLatency / metrics.completedCount) : 0;
                    
                    return (
                      <div key={idx}>
                        <h4 className="font-medium text-gray-900 mb-2">模型{idx + 1}: {getCurrentModel(config)}</h4>
                        <div className="space-y-1 text-sm">
                          <div>平均总耗时: <span className="font-medium">{avgTotalTime}ms</span></div>
                          <div>平均首Token延迟: <span className="font-medium">{avgFirstToken}ms</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* 具体结果对比 */}
              <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
                {results.map((result, index) => (
                  <div key={result.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-medium text-gray-900">测试 {index + 1}: {result.variable}</h3>
                    </div>
                    
                    {/* Prompt */}
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-1">Prompt:</h4>
                      <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm text-gray-800">
                        {result.prompt}
                      </div>
                    </div>
                    
                    {/* 模型结果对比 */}
                    <div className={`grid grid-cols-1 md:grid-cols-${modelCount} gap-4`}>
                      {result.results.map((res, idx) => {
                        const metrics = calculateMetrics(res);
                        
                        return (
                          <div key={idx} className={`border rounded-lg p-3 ${res.status === 'error' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="font-medium text-gray-900">模型{idx + 1}: {result.models[idx]}</h4>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${res.status === 'completed' ? 'bg-green-100 text-green-800' : res.status === 'running' ? 'bg-blue-100 text-blue-800' : res.status === 'error' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                                {res.status === 'pending' && '等待中'}
                                {res.status === 'running' && '运行中'}
                                {res.status === 'completed' && '已完成'}
                                {res.status === 'error' && '失败'}
                              </span>
                            </div>
                            
                            {/* 性能指标 */}
                            <div className="mb-3 text-xs text-gray-600 space-y-1">
                              <div>总耗时: {res.endTime && res.startTime ? `${res.endTime - res.startTime}ms` : '-'}</div>
                              {res.firstTokenTime && res.startTime && (
                                <div>首Token: {res.firstTokenTime - res.startTime}ms</div>
                              )}
                              {res.endTime && res.firstTokenTime && (
                                <div>生成: {res.endTime - res.firstTokenTime}ms</div>
                              )}
                              {metrics.tokensPerSecond && (
                                <div>速度: {metrics.tokensPerSecond} chars/s</div>
                              )}
                            </div>
                            
                            {/* 响应内容 */}
                            <div className="text-sm text-gray-800 whitespace-pre-wrap max-h-32 overflow-y-auto">
                              {res.error ? (
                                <span className="text-red-600">错误: {res.error}</span>
                              ) : (
                                res.response || '等待响应...'
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
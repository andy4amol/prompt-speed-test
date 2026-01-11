'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface BatchTestResult {
  id: string;
  variable: string;
  prompt: string;
  response: string;
  model: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
  startTime: number;
  firstTokenTime: number | null;
  endTime?: number;
}

export default function BatchResultsPage() {
  const searchParams = useSearchParams();
  const testId = searchParams.get('testId');
  const [results, setResults] = useState<BatchTestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundError, setNotFoundError] = useState(false);
  
  useEffect(() => {
    if (!testId) {
      setNotFoundError(true);
      setLoading(false);
      return;
    }
    
    // 从 localStorage 读取结果
    const savedResults = localStorage.getItem(testId);
    if (savedResults) {
      try {
        const parsedResults = JSON.parse(savedResults) as BatchTestResult[];
        setResults(parsedResults);
      } catch (error) {
        console.error('Failed to parse results:', error);
        setNotFoundError(true);
      }
    } else {
      setNotFoundError(true);
    }
    
    setLoading(false);
  }, [testId]);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载结果中...</p>
        </div>
      </div>
    );
  }
  
  if (notFoundError || !testId || results.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 text-lg mb-4">未找到测试结果</p>
          <a 
            href="/batch" 
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            返回批量测试
          </a>
        </div>
      </div>
    );
  }
  
  // 计算统计信息
  const totalTests = results.length;
  const completedTests = results.filter(r => r.status === 'completed').length;
  const failedTests = results.filter(r => r.status === 'error').length;
  const successRate = totalTests > 0 ? Math.round((completedTests / totalTests) * 100) : 0;
  
  // 获取使用的模型
  const usedModel = results[0]?.model || '未知模型';
  
  // 计算各时间指标
  const completedResults = results.filter(r => r.status === 'completed' && r.endTime && r.startTime);
  
  const totalTime = completedResults.reduce((sum, r) => {
    if (r.endTime && r.startTime) {
      return sum + (r.endTime - r.startTime);
    }
    return sum;
  }, 0);
  
  const avgTotalTime = completedResults.length > 0 ? Math.round(totalTime / completedResults.length) : 0;
  
  // 计算首token延迟统计
  const firstTokenLatencies = completedResults
    .filter(r => r.firstTokenTime !== null)
    .map(r => r.firstTokenTime! - r.startTime);
  
  const totalFirstTokenTime = firstTokenLatencies.reduce((sum, latency) => sum + latency, 0);
  const avgFirstTokenTime = firstTokenLatencies.length > 0 ? Math.round(totalFirstTokenTime / firstTokenLatencies.length) : 0;
  
  // 计算生成时间统计（从首token到结束）
  const generationTimes = completedResults
    .filter(r => r.firstTokenTime !== null)
    .map(r => r.endTime! - r.firstTokenTime!);
  
  const totalGenerationTime = generationTimes.reduce((sum, time) => sum + time, 0);
  const avgGenerationTime = generationTimes.length > 0 ? Math.round(totalGenerationTime / generationTimes.length) : 0;
  
  // 计算请求吞吐量（测试数/总耗时，单位：测试/秒）
  const throughput = totalTime > 0 ? (totalTests / (totalTime / 1000)).toFixed(2) : '0.00';
  
  // 计算总运行时间（从第一个测试开始到最后一个测试结束）
  const batchStartTime = Math.min(...results.map(r => r.startTime).filter(t => t > 0));
  const batchEndTime = Math.max(...results.map(r => r.endTime || 0).filter(t => t > 0));
  const totalBatchDuration = batchEndTime > batchStartTime ? batchEndTime - batchStartTime : 0;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold text-gray-900">批量测试结果</h1>
            <a 
              href="/batch" 
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              ← 返回批量测试
            </a>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-sm text-gray-500">测试总数</p>
                <p className="text-2xl font-bold text-gray-900">{totalTests}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">成功测试</p>
                <p className="text-2xl font-bold text-green-600">{completedTests}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">失败测试</p>
                <p className="text-2xl font-bold text-red-600">{failedTests}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">成功率</p>
                <p className="text-2xl font-bold text-blue-600">{successRate}%</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">使用模型</p>
                <p className="text-2xl font-bold text-gray-900 truncate">{usedModel}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">平均总耗时</p>
                <p className="text-2xl font-bold text-orange-600">{avgTotalTime}ms</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">平均首token延迟</p>
                <p className="text-2xl font-bold text-purple-600">{avgFirstTokenTime}ms</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">平均生成时间</p>
                <p className="text-2xl font-bold text-green-600">{avgGenerationTime}ms</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">吞吐量</p>
                <p className="text-2xl font-bold text-blue-600">{throughput} 测试/秒</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">总批次时长</p>
                <p className="text-2xl font-bold text-gray-900">{totalBatchDuration}ms</p>
              </div>
            </div>
          </div>
        </header>
        
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">测试详情</h2>
          
          <div className="space-y-6">
            {results.map((result, index) => (
              <div 
                key={result.id} 
                className={`border rounded-xl p-5 ${result.status === 'error' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium text-lg text-gray-900">
                      测试 {index + 1}: {result.variable}
                    </span>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${result.status === 'completed' ? 'bg-green-100 text-green-800' : result.status === 'running' ? 'bg-blue-100 text-blue-800' : result.status === 'error' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                      {result.status === 'pending' && '等待中'}
                      {result.status === 'running' && '运行中'}
                      {result.status === 'completed' && '已完成'}
                      {result.status === 'error' && '失败'}
                    </span>
                    <span className="bg-gray-100 text-gray-800 px-2.5 py-1 rounded-full text-xs font-medium">
                      模型: {result.model}
                    </span>
                  </div>
                  
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-4 text-sm">
                    <div className="flex flex-wrap items-center gap-3">
                      {result.endTime && result.startTime && (
                        <span className="text-gray-600">
                          总耗时: {result.endTime - result.startTime}ms
                        </span>
                      )}
                      {result.firstTokenTime && result.startTime && (
                        <span className="text-purple-600">
                          首token: {result.firstTokenTime - result.startTime}ms
                        </span>
                      )}
                      {result.endTime && result.firstTokenTime && (
                        <span className="text-green-600">
                          生成: {result.endTime - result.firstTokenTime}ms
                        </span>
                      )}
                    </div>
                    <span className="text-gray-500 whitespace-nowrap">
                      {new Date(result.startTime).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Prompt:</h3>
                    <div className="bg-white border border-gray-200 rounded-lg p-4 h-full min-h-[120px]">
                      <p className="text-gray-800 whitespace-pre-wrap">{result.prompt}</p>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Response:</h3>
                    <div className="bg-white border border-gray-200 rounded-lg p-4 h-full min-h-[120px] overflow-y-auto">
                      {result.error ? (
                        <span className="text-red-600">错误: {result.error}</span>
                      ) : (
                        <p className="text-gray-800 whitespace-pre-wrap">{result.response}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
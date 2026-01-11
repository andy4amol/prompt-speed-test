import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../utils/logger';

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

interface BatchLogRequest {
  testId: string;
  promptTemplate: string;
  variables: string[];
  model: string;
  platform: string;
  results: BatchTestResult[];
  timestamp: string;
  duration: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as BatchLogRequest;
    
    // Log batch summary
    await logger.log({
      timestamp: new Date().toISOString(),
      model: body.model,
      prompt: `Batch Test: ${body.promptTemplate}`,
      response: `Batch completed with ${body.results.length} tests`,
      metrics: {
        startTime: new Date(body.timestamp).getTime(),
        firstTokenTime: null,
        endTime: new Date().getTime(),
        totalTime: body.duration,
        firstTokenLatency: null,
        generationTime: null,
        tokenCount: body.results.reduce((sum, r) => sum + (r.response?.length || 0), 0),
        tokensPerSecond: 0
      }
    });
    
    // Log each test result individually
    for (const result of body.results) {
      if (result.status === 'completed' && result.endTime) {
        const totalTime = result.endTime - result.startTime;
        const firstTokenLatency = result.firstTokenTime ? result.firstTokenTime - result.startTime : null;
        const generationTime = result.firstTokenTime ? result.endTime - result.firstTokenTime : null;
        
        await logger.log({
          timestamp: new Date().toISOString(),
          model: result.model,
          prompt: result.prompt,
          response: result.response,
          metrics: {
            startTime: result.startTime,
            firstTokenTime: result.firstTokenTime,
            endTime: result.endTime,
            totalTime: totalTime,
            firstTokenLatency: firstTokenLatency,
            generationTime: generationTime,
            tokenCount: result.response?.length || 0,
            tokensPerSecond: generationTime ? Math.round((result.response?.length || 0) / (generationTime / 1000)) : null
          }
        });
      } else if (result.status === 'error') {
        await logger.log({
          timestamp: new Date().toISOString(),
          model: result.model,
          prompt: result.prompt,
          response: '',
          error: result.error || 'Unknown error',
          metrics: {
            startTime: result.startTime,
            firstTokenTime: null,
            endTime: result.endTime || Date.now(),
            totalTime: (result.endTime || Date.now()) - result.startTime,
            firstTokenLatency: null,
            generationTime: null,
            tokenCount: 0,
            tokensPerSecond: null
          }
        });
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to log batch results:', error);
    return NextResponse.json({ success: false, error: 'Failed to log batch results' }, { status: 500 });
  }
}

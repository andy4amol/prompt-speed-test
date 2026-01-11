import { writeFile, appendFile, mkdir, stat } from 'fs/promises';
import { join } from 'path';

interface LogEntry {
  timestamp: string;
  model: string;
  prompt: string;
  response: string;
  error?: string;
  metrics: {
    startTime: number;
    firstTokenTime: number | null;
    endTime: number;
    totalTime: number;
    firstTokenLatency: number | null;
    generationTime: number | null;
    tokenCount: number;
    tokensPerSecond: number | null;
  };
}

class Logger {
  private logDir: string;
  
  constructor() {
    this.logDir = join(process.cwd(), 'logs');
  }
  
  // 初始化日志目录
  private async ensureLogDir(): Promise<void> {
    try {
      await stat(this.logDir);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        await mkdir(this.logDir, { recursive: true });
      } else {
        throw error;
      }
    }
  }
  
  // 获取当天日志文件路径
  private getLogFilePath(): string {
    const today = new Date().toISOString().split('T')[0];
    return join(this.logDir, `${today}.jsonl`);
  }
  
  // 检查文件是否存在
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  // 异步写入日志
  public async log(entry: LogEntry): Promise<void> {
    try {
      // 确保日志目录存在
      await this.ensureLogDir();
      
      // 获取日志文件路径
      const logFilePath = this.getLogFilePath();
      
      // 格式化日志条目为JSON行
      const logLine = JSON.stringify(entry, null, 0) + '\n';
      
      // 检查文件是否存在，不存在则创建
      const exists = await this.fileExists(logFilePath);
      
      if (exists) {
        // 追加到现有文件
        await appendFile(logFilePath, logLine);
      } else {
        // 创建新文件
        await writeFile(logFilePath, logLine);
      }
      
    } catch (error) {
      console.error('Failed to write log:', error);
      // 降级处理：写入到控制台
      console.log('Log entry:', entry);
    }
  }
}

// 导出单例实例
export const logger = new Logger();

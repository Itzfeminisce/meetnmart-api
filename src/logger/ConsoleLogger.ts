import { LogEntry } from './LoggerInterface';

export class ConsoleLogger {
  log(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.service}]`;

    switch (entry.level) {
      case 'info':
        console.info(`${prefix} ${entry.message}`, entry.context || '');
        break;
      case 'warn':
        console.warn(`${prefix} ${entry.message}`, entry.context || '');
        break;
      case 'error':
        console.error(`${prefix} ${entry.message}`, entry.context || '');
        if (entry.stack) {
          console.error(`${prefix} Stack trace:`, entry.stack);
        }
        break;
      case 'debug':
        console.debug(`${prefix} ${entry.message}`, entry.context || '');
        break;
    }
  }

  info(message: string, context?: Record<string, any>) {
    this.log({ message, context, level: "info", timestamp: new Date, })
  }
  warn(message: string, context?: Record<string, any>) {
    this.log({ message, context, level: "warn", timestamp: new Date, })
  }
  error(message: string, error?: Error, context?: Record<string, any>) {
    this.log({ message, context: error, level: "error", timestamp: new Date, },)
  }
  debug(message: string, context?: Record<string, any>) {
    this.log({ message, context, level: "debug", timestamp: new Date, })
  }
}
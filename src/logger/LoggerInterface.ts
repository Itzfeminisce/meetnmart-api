export interface LogEntry {
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    timestamp: Date;
    context?: Record<string, any>;
    stack?: string;
    service?: string;
    requestId?: string;
}

export interface LoggerInterface {
    info(message: string, context?: Record<string, any>): void;
    warn(message: string, context?: Record<string, any>): void;
    error(message: string, error?: Error, context?: Record<string, any>): void;
    debug(message: string, context?: Record<string, any>): void;
}
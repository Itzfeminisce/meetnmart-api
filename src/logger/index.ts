// import { LoggerInterface } from './LoggerInterface';
import { ConsoleLogger } from './ConsoleLogger';

// Create default logger
// const defaultLogger = new ConsoleLogger();
const loggerSystem = new ConsoleLogger();

export const logger = loggerSystem 
// loggerSystem.addLogger(new FileLogger('vtu-service'));


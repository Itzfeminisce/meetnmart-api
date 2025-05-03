import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { v4 as uuidv4 } from 'uuid';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // Generate request ID
  const requestId = uuidv4();
  
  req.headers['x-request-id'] = requestId;
  
  // Log request
  logger.info(`${req.method} ${req.originalUrl}`, {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  
  // Track response time
  const start = Date.now();
  
  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'error' : 'info';
    
    if (level === 'error') {
      logger.error(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, undefined, {
        requestId,
        statusCode: res.statusCode,
        duration,
        method: req.method,
        url: req.originalUrl
      });
    } else {
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
        requestId,
        statusCode: res.statusCode,
        duration,
        method: req.method,
        url: req.originalUrl
      });
    }
  });
  
  next();
};
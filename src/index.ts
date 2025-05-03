import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { ipAddressMiddleware } from './middleware/ipMiddleware';
import { initSocketIO } from './utils/socketio';
import http from 'http';
import { getEnvVar } from './utils/env';
import { logger } from './logger';
import { createLivekitToken } from './routes';
import { asyncHandler } from './utils/asyncHandlerUtils';


const app: Express = express();
const allowedOrigins = [process.env.APP_URL || 'http://localhost:3000'];

const port = process.env.PORT || 8081


// Trust proxy settings for Express
if (getEnvVar("NODE_ENV") === 'production') {
  // Trust first proxy in production
  app.set('trust proxy', 1);
} else {
  // Don't trust proxy in development
  app.set('trust proxy', false);
}


// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(helmet());
app.use(morgan('dev'));
app.use(ipAddressMiddleware());

const httpServer = http.createServer(app);

// Initialize Socket.IO with proper configuration
initSocketIO(httpServer, {
  cors: {
    origin: allowedOrigins,
  },
  auth: {required: true, tokenKey: "token"}
});

// Health Check Route
app.get('/', (_: Request, res: Response) => {
  res.send('MeetnMart API');
});

// Services Route
app.use('/api/livekit/token', asyncHandler(createLivekitToken));

// Error handling
app.use(notFound);
app.use(errorHandler);

// Start server
httpServer.listen(port, () => {
  logger.info(`Application started on ${port}`);
});
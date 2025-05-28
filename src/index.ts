import express from 'express';
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
import { createLivekitToken, notifyWaitlistUser } from './routes';
import { asyncHandler } from './utils/asyncHandlerUtils';
import { MessagingRouter } from './routes/messaging';
import { CallsRouter } from './routes/calls';
import fileUpload from "express-fileupload"
import { UploadRouter } from './routes/uploads';
import { SearchRouter } from './routes/search';


const app = express();
const port = process.env.PORT || 8081;

// Define allowed origins with more flexibility
const allowedOrigins = [
  ...(getEnvVar("NODE_ENV") === 'development' ? [
    'http://localhost:3000',
    'http://localhost:3001',
  ]:[]),
  process.env.APP_URL ,
  'https://dev.meetnmart.com',
  'https://meetnmart.com',
  'https://www.meetnmart.com',
  'https://www.dev.meetnmart.com',
  // Add any other domains that need access
];

// Add a debugging endpoint to check CORS settings
app.get('/debug-cors', (req, res) => {
  res.json({
    allowedOrigins,
    requestOrigin: req.headers.origin,
    appUrl: process.env.APP_URL,
    nodeEnv: process.env.NODE_ENV
  });
});

// Trust proxy settings for Express
if (getEnvVar("NODE_ENV") === 'production') {
  // Trust first proxy in production
  app.set('trust proxy', 1);
} else {
  // Don't trust proxy in development
  app.set('trust proxy', false);
}

// Apply CORS middleware before other middleware to handle preflight requests properly
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      logger.warn(`Origin ${origin} not allowed by CORS`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'X-Requested-With'],
  maxAge: 86400 // 24 hours in seconds - how long the results of a preflight request can be cached
}));

// Other middleware

app.use(fileUpload());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet({
  // Disable contentSecurityPolicy for development if needed
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false
}));
app.use(morgan('dev'));
app.use(ipAddressMiddleware());


const httpServer = http.createServer(app);

// Initialize Socket.IO with proper configuration
initSocketIO(httpServer, { 
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  auth: {required: true, tokenKey: "token" },
});

// Health Check Route
app.get('/', (_, res) => {
  res.send('MeetnMart API');
});

// Add explicit OPTIONS handling for preflight requests for the main app
app.options('*', cors());

// Services Route - make sure to use the router correctly
// If createLivekitToken is a router:

// OR if createLivekitToken is a handler function (not a router):
app.use('/uploads', UploadRouter);
app.use('/messaging', MessagingRouter);
app.use('/search', SearchRouter);
app.use('/calls', CallsRouter);
app.post('/livekit/token', cors(), asyncHandler(createLivekitToken));
app.post('/waitlist', asyncHandler(notifyWaitlistUser));

// Error handling
app.use(notFound);
app.use(errorHandler);

// Start server
httpServer.listen(port, () => {
  logger.info(`Application started on port ${port}`);
  logger.info(`Allowed origins: ${allowedOrigins.join(', ')}`);
  logger.info(`APP_URL from environment: ${process.env.APP_URL || 'not set'}`);
});
// Updated socketio.ts implementation with fixes for connection issues

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { logger } from '../logger';
import { cacheService, ICacheService } from './cacheUtils';
import { verifyToken } from './jwtUtils';
import { AppEvent, CallAction } from '../events';
import { updateUserProfileById } from '../functions';

const socketLogger = logger;

//  const cacheKey = `${this.config.cache?.prefix}auth:${token}`;

export interface AuthenticatedSocket extends Socket {
  userId?: string; // Made optional to handle non-authenticated connections
}

export interface SocketConfig {
  cors?: {
    origin?: string | string[];
    methods?: string[];
    credentials?: boolean;
    allowedHeaders?: string[];
  };
  auth?: {
    required?: boolean;
    tokenKey?: string;
  };
  cache?: {
    ttl?: number;
    prefix?: string;
  };
}

export class SocketIOServer {
  private io: Server;
  private cacheService: ICacheService;
  private config: SocketConfig;

  constructor(
    httpServer: HttpServer,
    config: SocketConfig = {}
  ) {
    // Store original config for debugging
    const originalConfig = { ...config };

    this.config = {
      cors: {
        origin: config.cors?.origin || process.env.APP_URL || 'http://localhost:3000',
        methods: config.cors?.methods || ['GET', 'POST'],
        credentials: config.cors?.credentials ?? true,
        allowedHeaders: config.cors?.allowedHeaders || ['Content-Type', 'Authorization']
      },
      auth: {
        required: config.auth?.required ?? true,
        tokenKey: config.auth?.tokenKey || 'token'
      },
      cache: {
        ttl: config.cache?.ttl || 30 * 60, // 30 minutes
        prefix: config.cache?.prefix || 'socket:'
      }
    };


    this.io = new Server(httpServer, {
      cors: this.config.cors,
      transports: ['websocket', 'polling'],
      connectTimeout: 45000, // Increase connection timeout to 45 seconds
    });

    this.cacheService = cacheService;

    this.setupMiddleware();
    this.setupEventHandlers();

    socketLogger.info('Socket.IO server initialized successfully');
  }

  private async authenticateSocket(socket: Socket): Promise<string | undefined> {
    // Log authentication attempt
    socketLogger.debug('Authenticating socket connection', {
      socketId: socket.id,
      authRequired: this.config.auth?.required,
      tokenKey: this.config.auth?.tokenKey
    });

    // Get token from either auth object or query parameters for flexibility
    const token = socket.handshake.auth[this.config.auth?.tokenKey || ''] ||
      socket.handshake.query[this.config.auth?.tokenKey || ''] as string;

    // Log token status (without revealing token content)
    socketLogger.debug('Token status', {
      socketId: socket.id,
      hasToken: !!token
    });

    // If authentication is not required and no token provided, allow connection without userId
    if (!token && !this.config.auth?.required) {
      socketLogger.debug('No token provided but auth not required, allowing anonymous connection', {
        socketId: socket.id
      });
      return undefined;
    }

    // If authentication is required but no token, reject
    if (!token && this.config.auth?.required) {
      socketLogger.warn('Authentication required but no token provided', {
        socketId: socket.id
      });
      throw new Error('Authentication required');
    }

    try {
      // Check cache first for performance
      const cacheKey = `${this.config.cache?.prefix}auth:${token}`;
      const cachedSocketId = await this.cacheService.get<string>(cacheKey);

      if (cachedSocketId) {
        socketLogger.debug('User authenticated from cache', {
          socketId: socket.id,
          cachedSocketId: cachedSocketId
        });
        (socket as AuthenticatedSocket).userId = token;
        return cachedSocketId;
      }

      // Verify JWT token
      // const decoded = await verifyToken(token);

      // if (!decoded || !decoded.userId) {
      //   socketLogger.warn('Invalid token - missing userId in payload', {
      //     socketId: socket.id
      //   });
      //   throw new Error('Invalid token format');
      // }

      // Cache the successful authentication
      (socket as AuthenticatedSocket).userId = token;
      await this.cacheService.set(cacheKey, socket.id, this.config.cache?.ttl);
      await updateUserProfileById(token, {is_online: true})

      socketLogger.debug('User authenticated with JWT', {
        socketId: socket.id,
        token: token
      });

      return socket.id;
    } catch (error) {
      socketLogger.error('Token verification failed', error, {
        socketId: socket.id,
        error: error.message
      });
      throw new Error('Invalid token');
    }
  }

  private async getUserByAuthTokenFormCache(tokenOrUserId: string) {
    try {

      const cacheKey = `${this.config.cache?.prefix}auth:${tokenOrUserId}`;
      const cachedSocketId = await this.cacheService.get<string>(cacheKey);

      if (cachedSocketId) {
        socketLogger.info('User Sockey ID received from cache', {
          cachedSocketId: cachedSocketId
        });
        return cachedSocketId;
      }


      socketLogger.error('Unable to get socket ID from cache', undefined, {
        cacheKey,
        tokenOrUserId
      });

      throw new Error("Unable to get socket ID from cache")
    } catch (error) {
      socketLogger.error('Unable to get socket ID from cache', error, {
        error: error.message
      });
      throw new Error('Invalid token');
    }
  }

  private setupMiddleware() {
    // Add connection monitoring
    this.io.engine.on('connection', (socket) => {
      socketLogger.debug('Transport connection established', {
        id: socket.id,
        transport: socket.transport.name
      });
    });

    this.io.engine.on('connectionError', (err) => {
      socketLogger.error('Transport connection error', err, {
        error: err.message,
        code: err.code
      });
    });

    // Socket.IO middleware for authentication
    this.io.use(async (socket: Socket, next) => {
      try {
        socketLogger.info('Socket connection attempt', {
          socketId: socket.id,
          // headers: {
          //   ...socket.handshake.headers,
          //   cookie: '[redacted]' // Don't log cookies
          // },
          query: socket.handshake.query
        });

        // Try to authenticate the socket
        await this.authenticateSocket(socket);

        // Attach socketId to socket object if available
        // if (socketId) {
        //   (socket as AuthenticatedSocket).userId = socketId;
        // }else{

        // }

        // socketLogger.info('Socket middleware passed', {
        //   socketId: socket.id,
        //   userId: socketId || 'anonymous'
        // });

        next();
      } catch (error) {
        socketLogger.error('Socket middleware error', error, {
          socketId: socket.id,
          error: error.message
        });
        next(new Error(error.message || 'Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    // Monitor global Socket.IO events
    this.io.engine.on('initial_headers', (headers) => {
      socketLogger.debug('Initial headers sent');
    });

    this.io.on('connect_error', (err) => {
      socketLogger.error('Connection error event', err, {
        error: err.message,
        type: err.type
      });
    });

    this.io.on('connection', (socket: Socket) => {
      const authenticatedSocket = socket as AuthenticatedSocket;

      // Log successful connection
      socketLogger.info('Client connected successfully', {
        socketId: authenticatedSocket.id,
        userId: authenticatedSocket.userId || 'anonymous',
        transport: socket.conn.transport.name
      });

      // Join user's private room if authenticated
      if (authenticatedSocket.userId) {
        this.joinUserRoom(authenticatedSocket);
      }

      // Setup event handlers
      this.setupSocketEvents(authenticatedSocket);

      // Handle disconnect
      authenticatedSocket.on('disconnect', (reason) => {
        socketLogger.info('Client disconnected', {
          socketId: authenticatedSocket.id,
          userId: authenticatedSocket.userId || 'anonymous',
          reason
        });
        this.handleDisconnect(authenticatedSocket);
      });
    });
  }

  private joinUserRoom(socket: AuthenticatedSocket) {
    if (!socket.userId) return;

    const userRoom = `user:${socket.userId}`;
    socket.join(userRoom);
    socketLogger.debug('User joined private room', {
      socketId: socket.id,
      userId: socket.userId,
      room: userRoom
    });
  }

  private setupSocketEvents(socket: AuthenticatedSocket) {
    // Debug event to confirm connection
    socket.emit('connection_confirmed', {
      socketId: socket.id,
      isAuthenticated: !!socket.userId,
      timestamp: Date.now()
    });

    // Ping/Pong
    socket.on('ping', (callback) => {
      socketLogger.debug('Received ping', { socketId: socket.id });
      if (typeof callback === 'function') {
        callback({ pong: true, timestamp: Date.now() });
      } else {
        socket.emit('pong', { timestamp: Date.now() });
      }
    });

    // Room subscription
    socket.on('subscribe', (room: string) => {
      this.handleRoomSubscription(socket, room);
    });

    socket.on('unsubscribe', (room: string) => {
      this.handleRoomUnsubscription(socket, room);
    });

    // socket.on(CallAction.Incoming, (data) => {
    //   this.handleIncomingCall(socket, data);
    // })


    socket.on(CallAction.Outgoing, ([data]) => {
      this.handleOutgoingCall(socket, data);
    })
    socket.on(CallAction.Ended, ([data]) => {
      this.handleEndCall(socket, data);
    })
    socket.on(CallAction.Rejected, ([data]) => {
      this.handleRejectCall(socket, data);
    })
    socket.on(CallAction.Accepted, ([data]) => {
      this.handleAcceptedCall(socket, data);
    })
    socket.on(CallAction.EscrowRequested, ([data]) => {
      this.handleEscrowRequested(socket, data);
    })
    socket.on(CallAction.EscrowAccepted, ([data]) => {
      this.handleEscrowAccepted(socket, data);
    })
    socket.on(CallAction.EscrowRejected, ([data]) => {
      this.handleEscrowRejected(socket, data);
    })

    // Error handling
    socket.on('error', (error) => {
      socketLogger.error('Socket error', error, {
        socketId: socket.id,
        userId: socket.userId,
        error
      });
    });
  }

  private handleRoomSubscription(socket: AuthenticatedSocket, room: string) {
    try {
      if (this.isValidRoom(room, socket.userId)) {
        socket.join(room);
        socketLogger.debug('User subscribed to room', {
          socketId: socket.id,
          userId: socket.userId || 'anonymous',
          room
        });
        // Confirm subscription to client
        socket.emit('subscribed', { room });
      } else {
        socketLogger.warn('Unauthorized room subscription attempt', {
          socketId: socket.id,
          userId: socket.userId || 'anonymous',
          room
        });
        socket.emit('subscribe_error', { room, error: 'Unauthorized' });
      }
    } catch (error) {
      socketLogger.error('Error in room subscription', error, {
        socketId: socket.id,
        userId: socket.userId || 'anonymous',
        room,
        error: error.message
      });
      socket.emit('subscribe_error', { room, error: 'Internal error' });
    }
  }

  private handleRoomUnsubscription(socket: AuthenticatedSocket, room: string) {
    try {
      socket.leave(room);
      socketLogger.debug('User unsubscribed from room', {
        socketId: socket.id,
        userId: socket.userId || 'anonymous',
        room
      });
      socket.emit('unsubscribed', { room });
    } catch (error) {
      socketLogger.error('Error in room unsubscription', error, {
        socketId: socket.id,
        userId: socket.userId || 'anonymous',
        room,
        error: error.message
      });
    }
  }

  private async handleDisconnect(socket: AuthenticatedSocket) {
    const cacheKey = `${this.config.cache?.prefix}auth:${socket?.userId}`;
    await this.cacheService.del(cacheKey);
    await updateUserProfileById(socket?.userId, {is_online: false})
    socket.emit(AppEvent.DISCONNECT, {userId: socket.id})
  }

  private async handleOutgoingCall(socket: AuthenticatedSocket, data: any) {
    try {
      // const room = data.room
      // const caller = data.caller
      const receiver = data.receiver

      const receiverSocketId = await this.getUserByAuthTokenFormCache(receiver.id)

      // Notify the seller/reciiver they have a call
      this.io.to(receiverSocketId).emit(CallAction.Incoming, data)
    } catch (error) {
      socketLogger.error('Error in handle outgoing call', error, {
        socketId: socket.id,
        data,
        userId: socket.userId || 'anonymous',
        error: error.message
      });
    }
  }
  private async handleEndCall(socket: AuthenticatedSocket, data: any) {
    try {
      // const room = data.room
      // const caller = data.caller
      const receiver = data.receiver

      const receiverSocketId = await this.getUserByAuthTokenFormCache(receiver.id)

      // Notify the seller/reciiver they have a call
      this.io.to(receiverSocketId).emit(CallAction.Ended, data)
    } catch (error) {
      socketLogger.error('Error in handle end call', error, {
        socketId: socket.id,
        data,
        userId: socket.userId || 'anonymous',
        error: error.message
      });
    }
  }
  private async handleRejectCall(socket: AuthenticatedSocket, data: any) {
    try {
      // const room = data.room
      // const caller = data.caller
      const caller = data.caller
      const callerSocketId = await this.getUserByAuthTokenFormCache(caller.id)

      // Notify the seller/reciiver they have a call
      this.io.to(callerSocketId).emit(CallAction.Rejected, data)
    } catch (error) {
      socketLogger.error('Error in handle reject call', error, {
        socketId: socket.id,
        data,
        userId: socket.userId || 'anonymous',
        error: error.message
      });
    }
  }
  private async handleAcceptedCall(socket: AuthenticatedSocket, data: any) {
    try {
      // const room = data.room
      // const caller = data.caller
      const caller = data.caller
      const callerSocketId = await this.getUserByAuthTokenFormCache(caller.id)

      // Notify the seller/reciiver they have a call
      this.io.to(callerSocketId).emit(CallAction.Accepted, data)
    } catch (error) {
      socketLogger.error('Error in handle accept call', error, {
        socketId: socket.id,
        data,
        userId: socket.userId || 'anonymous',
        error: error.message
      });
    }
  }
  private async handleEscrowRequested(socket: AuthenticatedSocket, data: any) {
    try {
      // const room = data.room
      // const caller = data.caller
      const caller = data.caller
      const callerSocketId = await this.getUserByAuthTokenFormCache(caller.id)

      // Notify the seller/reciiver they have a call
      this.io.to(callerSocketId).emit(CallAction.EscrowRequested, data)
    } catch (error) {
      socketLogger.error('Error in handle escrow requested call', error, {
        socketId: socket.id,
        data,
        userId: socket.userId || 'anonymous',
        error: error.message
      });
    }
  }
  private async handleEscrowAccepted(socket: AuthenticatedSocket, data: any) {
    try {
      // const room = data.room
      // const caller = data.caller
      const receiver = data.receiver
      const receiverSocketId = await this.getUserByAuthTokenFormCache(receiver.id)

      // Notify the seller/reciiver they have a call
      this.io.to(receiverSocketId).emit(CallAction.EscrowAccepted, data)
    } catch (error) {
      socketLogger.error('Error in handle escrow accepted call', error, {
        socketId: socket.id,
        data,
        userId: socket.userId || 'anonymous',
        error: error.message
      });
    }
  }
  private async handleEscrowRejected(socket: AuthenticatedSocket, data: any) {
    try {
      // const room = data.room
      // const caller = data.caller
      const receiver = data.receiver
      const receiverSocketId = await this.getUserByAuthTokenFormCache(receiver.id)

      // Notify the seller/reciiver they have a call
      this.io.to(receiverSocketId).emit(CallAction.EscrowRejected, data)
    } catch (error) {
      socketLogger.error('Error in handle escrow rejected call', error, {
        socketId: socket.id,
        data,
        userId: socket.userId || 'anonymous',
        error: error.message
      });
    }
  }

  private isValidRoom(room: string, userId?: string): boolean {
    if (room.startsWith('public:')) return true;
    if (userId && room === `user:${userId}`) return true;
    return false;
  }

  // Public methods
  public sendToUser(userId: string, event: string, data: any) {
    try {
      this.io.to(`user:${userId}`).emit(event, data);
      socketLogger.debug('Message sent to user', { userId, event });
    } catch (error) {
      socketLogger.error('Error sending message to user', error, {
        userId,
        event,
        error: error.message
      });
    }
  }

  public broadcast(event: string, data: any, room?: string) {
    try {
      if (room) {
        this.io.to(room).emit(event, data);
        socketLogger.debug('Message broadcast to room', { room, event });
      } else {
        this.io.emit(event, data);
        socketLogger.debug('Message broadcast to all', { event });
      }
    } catch (error) {
      socketLogger.error('Error broadcasting message', error, {
        event,
        room,
        error: error.message
      });
    }
  }

  public getConnectedClients(): number {
    return this.io.engine.clientsCount;
  }

  public getIO(): Server {
    return this.io;
  }
}

// Singleton instance
let socketIOServer: SocketIOServer | null = null;

export const initSocketIO = (
  httpServer: HttpServer,
  config?: SocketConfig
): SocketIOServer => {
  if (!socketIOServer) {
    socketIOServer = new SocketIOServer(httpServer, config);
  }
  return socketIOServer;
};

export const getSocketIO = (): SocketIOServer => {
  if (!socketIOServer) {
    throw new Error('Socket.IO server not initialized');
  }
  return socketIOServer;
};
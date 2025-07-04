// Updated socketio.ts implementation with fixes for connection issues

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { logger } from '../logger';
import { cacheService, ICacheService } from './cacheUtils';
import { AppEvent, CallAction } from '../events';
import { updateUserProfileById } from '../functions';
import { fetchUserById, getSystemRequiredPreferences, releaseFund, storeNewCallSession, storeTransaction, updateCallSession, updateTransaction, updateWallet } from '../routes';
import { CallData, EscrowData, EscrowReleasedData } from '../globals';
import { mailerV2 } from './mailer_v2';
import { calculateWithdrawalReceivedAmount, WithdrawalOptions } from './commonUtils';

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
    // socketLogger.debug('Authenticating socket connection', {
    //   socketId: socket.id,
    //   authRequired: this.config.auth?.required,
    //   tokenKey: this.config.auth?.tokenKey
    // });

    // Get token from either auth object or query parameters for flexibility
    const token = socket.handshake.auth[this.config.auth?.tokenKey || ''] ||
      socket.handshake.query[this.config.auth?.tokenKey || ''] as string;

    // Log token status (without revealing token content)
    // socketLogger.debug('Token status', {
    //   socketId: socket.id,
    //   hasToken: !!token
    // });

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
      await updateUserProfileById(token, { is_online: true, })

      // socketLogger.debug('User authenticated with JWT', {
      //   socketId: socket.id,
      //   token: token
      // });

      return socket.id;
    } catch (error) {
      socketLogger.error('Token verification failed', error, {
        socketId: socket.id,
        error: error.message
      });
      throw new Error('Invalid token');
    }
  }

  public getSocketId(userId: string) {
    return this.getUserByAuthTokenFormCache(userId);
  }

  private async getUserByAuthTokenFormCache(tokenOrUserId: string) {
    try {

      const cacheKey = `${this.config.cache?.prefix}auth:${tokenOrUserId}`;
      const cachedSocketId = await this.cacheService.get<string>(cacheKey);

      // console.log({cacheKey, cachedSocketId});


      if (cachedSocketId) {
        // socketLogger.info('User Socket ID received from cache', {
        //   cachedSocketId: cachedSocketId
        // });
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
      // socketLogger.debug('Transport connection established', {
      //   id: socket.id,
      //   transport: socket.transport.name
      // });
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
        // socketLogger.info('Socket connection attempt', {
        //   socketId: socket.id,
        // headers: {
        //   ...socket.handshake.headers,
        //   cookie: '[redacted]' // Don't log cookies
        // },
        query: socket.handshake.query
        // });

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
      // if (authenticatedSocket.userId) {
      //   this.joinUserRoom(authenticatedSocket);
      // }

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

  private async setupSocketEvents(socket: AuthenticatedSocket) {
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



    this.handleCheckUserPreferences(socket).then(preferences => {
      socket.emit("check_required_user_preferences", preferences)
    })



    socket.on(CallAction.CalculateWithdrawalReceivedAmount, ([data]) => {
      this.calculateWithdrawalReceivedAmount(socket, data);
    })
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
    socket.on(CallAction.EscrowReleased, ([data]) => {
      this.handleEscrowReleased(socket, data);
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

  private async handleCheckUserPreferences(socket: any) {
    // console.log({ socket });
    const userId = socket.userId;


    if (userId) {
      const socketId = socket.id;

      const preferences = await getSystemRequiredPreferences(userId)

      return preferences
    }


    // const userId = 
    // const socket = getSocketIO()
    // const socketId = await socket.getSocketId(profile.id)

    // console.log("Socket ID", {socketId});


    // socket.getIO().to(socketId).emit("check_required_user_preferences", {
    //     allows_notification_services: false,
    //     allows_location_services: false,
    //     has_fcm_token: false
    // })
  }

  private async handleDisconnect(socket: AuthenticatedSocket) {
    const cacheKey = `${this.config.cache?.prefix}auth:${socket?.userId}`;
    await this.cacheService.del(cacheKey);
    await updateUserProfileById(socket?.userId, { is_online: false })
    socket.emit(AppEvent.DISCONNECT, { userId: socket.id })
  }

  private async calculateWithdrawalReceivedAmount(socket: AuthenticatedSocket, withdrawalAmount: number) {
      const amount = calculateWithdrawalReceivedAmount(withdrawalAmount)
      // console.log({amount, withdrawalAmount});
      
      socket.emit(CallAction.CalculateWithdrawalReceivedAmount, amount)
  }
  private async handleOutgoingCall(socket: AuthenticatedSocket, data: any) {
    try {
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
  private async handleEndCall(socket: AuthenticatedSocket, payload: CallData<{ callSessionId: string }>) {
    try {
      // const receiver = payload.receiver

      // const receiverSocketId = await this.getUserByAuthTokenFormCache(receiver.id)

      if ((socket.userId === payload.caller.id) && payload.data.callSessionId) {
        // End call officially if the caller ends the call
        await updateCallSession(payload.data.callSessionId, {
          ended_at: new Date()
        })
      }

      // Notify everyone on the call
      socket.emit(CallAction.Ended, payload)
    } catch (error) {
      socketLogger.error('Error in handle end call', error, {
        socketId: socket.id,
        payload,
        userId: socket.userId || 'anonymous',
        error: error.message
      });
    }
  }
  private async handleRejectCall(socket: AuthenticatedSocket, data: any) {
    try {
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
  private async handleAcceptedCall(socket: AuthenticatedSocket, payload: CallData) {
    try {
      const caller = payload.caller
      const receiver = payload.receiver
      const callerSocketId = await this.getUserByAuthTokenFormCache(caller.id)
      const receiverSocketId = await this.getUserByAuthTokenFormCache(receiver.id)

      const callSessionId = await storeNewCallSession(payload)

      // Notify the seller/reciiver they have a call
      this.io.to(callerSocketId).emit(CallAction.Accepted, payload, callSessionId)
      this.io.to(receiverSocketId).emit(CallAction.Accepted, payload, callSessionId)
    } catch (error) {
      socketLogger.error('Error in handle accept call', error, {
        socketId: socket.id,
        payload,
        userId: socket.userId || 'anonymous',
        error: error.message
      });
    }
  }
  private async handleEscrowRequested(socket: AuthenticatedSocket, payload: EscrowData) {
    try {
      console.log("[handleEscrowRequested]#reference", { payload });

      const caller = payload.caller
      const callerSocketId = await this.getUserByAuthTokenFormCache(caller.id)

      const reference = await storeTransaction(payload)

      payload.data.reference = reference

      // Notify the seller/reciiver they have a call
      this.io.to(callerSocketId).emit(CallAction.EscrowRequested, payload)
    } catch (error) {
      socketLogger.error('Error in handle escrow requested call', error, {
        socketId: socket.id,
        payload,
        userId: socket.userId || 'anonymous',
        error: error.message
      });
    }
  }
  private async handleEscrowReleased(socket: AuthenticatedSocket, payload: EscrowReleasedData) {
    // The buyer had acknoleged and satistfied with product, now releasing payment to seller
    // buyer is the caller, seller is the receiver
    try {
      console.log("[handleEscrowReleased]#payload");

      // const caller = payload.caller
      // const receiver = payload.receiver

      // const buyerSocketId = await this.getUserByAuthTokenFormCache()

      const sellerData = await fetchUserById(payload.receiver.id)
      const escrow = await releaseFund(payload.data.transaction_id, payload.receiver.id, payload.data.feedback)


      await mailerV2.sendEmailWithRetry(
        () => mailerV2.sendTemplateEmail({
          subject: "Escrow Released",
          template: "escrow-released",
          to: sellerData.email, // || sellerData.phone

          reference: payload.data.reference,
          itemTitle: payload.data.itemTitle,
          itemDescription: payload.data.itemDescription,
          amount: escrow.amount,
          oldStatus: payload.data.status,
          newStatus: escrow.status,
          feedback: payload.data.feedback,
          fullName: payload.data.seller_name,
          buyerName: payload.data.buyer_name
        })
      )

      socket.emit(CallAction.EscrowReleased, {
        data: {
          amount: escrow.amount,
          feedback: payload.data.feedback
        },
        status: "success",
        message: "Payment has been released and notification sent to seller."
      })

    } catch (error) {
      socket.emit(CallAction.EscrowReleased, {
        status: "error",
        message: `Notification could not be delivered after several attempts. We will try again shortly.`
      })
      socketLogger.error('Error in handle escrow released call', error, {
        socketId: socket.id,
        payload,
        userId: socket.userId || 'anonymous',
        error: error.message
      });
    }
  }
  private async handleEscrowAccepted(socket: AuthenticatedSocket, payload: EscrowData) {
    try {
      if (!payload.data.reference) throw new Error("[handleEscrowAccepted]#payload.reference not found")
      if (!payload.data.callSessionId) throw new Error("[handleEscrowAccepted]#payload.callSessionId not found")


      const receiver = payload.receiver
      const receiverSocketId = await this.getUserByAuthTokenFormCache(receiver.id)

      await updateTransaction(payload.data.reference, {
        status: "held",
        call_session_id: payload.data.callSessionId
      })

      // Update escrowed balance
      await updateWallet(receiver.id, { escrowed_balance: payload.data.amount })

      // Notify the seller/reciiver they have a call
      this.io.to(receiverSocketId).emit(CallAction.EscrowAccepted, payload)
    } catch (error) {
      socketLogger.error('Error in handle escrow accepted call', error, {
        socketId: socket.id,
        payload,
        userId: socket.userId || 'anonymous',
        error: error.message
      });
    }
  }
  private async handleEscrowRejected(socket: AuthenticatedSocket, payload: EscrowData) {
    console.log("[handleEscrowRejected]#payload", { payload });

    try {
      if (!payload.data.reference) throw new Error("[handleEscrowRejected]#payload.reference not found")
      if (!payload.data.callSessionId) throw new Error("[handleEscrowRejected]#payload.callSessionId not found")

      const receiver = payload.receiver
      const receiverSocketId = await this.getUserByAuthTokenFormCache(receiver.id)

      await updateTransaction(payload.data.reference, {
        status: "rejected",
        call_session_id: payload.data.callSessionId
      })
      // Notify the seller/reciiver they have a call
      this.io.to(receiverSocketId).emit(CallAction.EscrowRejected, payload)
    } catch (error) {
      socketLogger.error('Error in handle escrow rejected call', error, {
        socketId: socket.id,
        payload,
        userId: socket.userId || 'anonymous',
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

export function initSocketIO(
  httpServer: HttpServer,
  config?: SocketConfig
): SocketIOServer {
  if (!socketIOServer) {
    socketIOServer = new SocketIOServer(httpServer, config);
  }
  return socketIOServer;
};

export function getSocketIO(): SocketIOServer {
  if (!socketIOServer) {
    throw new Error('Socket.IO server not initialized');
  }
  return socketIOServer;
};
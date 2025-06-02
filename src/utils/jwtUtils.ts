import jwt, { SignOptions } from 'jsonwebtoken';
import { logger } from '../logger';
import { TokenBlacklist } from './tokenBlacklist';
import { getEnvVar } from './env';

// Environment variables should be properly set in your application
const JWT_SECRET = getEnvVar("JWT_SECRET") as jwt.Secret;
const JWT_EXPIRES_IN = getEnvVar("JWT_EXPIRES_IN", "7d");
const JWT_REFRESH_SECRET = getEnvVar("JWT_REFRESH_SECRET") as jwt.Secret;
const JWT_REFRESH_EXPIRES_IN = getEnvVar("JWT_REFRESH_EXPIRES_IN", "7d");
const JWT_ISSUER = getEnvVar("BASE_URL");
const JWT_AUDIENCE = getEnvVar("FRONTEND_URL");

/**
 * Interface for JWT payload
 */
export interface JwtPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

/**
 * Interface for token response
 */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number | string;
  tokenId: string;
}

/**
 * Generates JWT tokens for a user
 * @param user User entity
 * @returns TokenResponse object containing access and refresh tokens
 */
export function generateTokens(user: {id: string}, expiresIn: string = JWT_EXPIRES_IN): TokenResponse {
  if (!user || !user.id) {
    logger.error('Cannot generate token for invalid user');
    throw new Error('Invalid user data for token generation');
  }

  try {
    const tokenId = crypto.randomUUID();

    // Create payload with only necessary user information
    const payload: JwtPayload = {
      userId: user.id,
    };

    // Generate access token with additional security options
    const accessTokenOptions: SignOptions = {
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      jwtid: tokenId
    };

    const accessToken = jwt.sign(
      payload,
      JWT_SECRET,
      accessTokenOptions
    );

    // Generate refresh token with minimal payload and security options
    const refreshTokenOptions: SignOptions = {
      expiresIn: JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      jwtid: crypto.randomUUID()
    };

    const refreshToken = jwt.sign(
      { userId: user.id },
      JWT_REFRESH_SECRET,
      refreshTokenOptions
    );

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenId
    };
  } catch (error) {
    logger.error('Token generation failed', error);
    throw new Error('Failed to generate authentication tokens');
  }
}

/**
 * Verifies a JWT token
 * @param token JWT token to verify
 * @returns Decoded token payload
 */
export async function verifyToken(token: string): Promise<JwtPayload> {
  try {
    // First check if token is blacklisted
    const isBlacklisted = await TokenBlacklist.isBlacklisted(token);
    if (isBlacklisted) {
      throw new Error('Token has been revoked');
    }

    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as JwtPayload;
    
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn('Token expired', { token });
      throw new Error('Token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid token', { token, error });
      throw new Error('Invalid token');
    } else {
      logger.error('Token verification failed', error);
      throw new Error('Token verification failed');
    }
  }
}

/**
 * Verifies a refresh token
 * @param token Refresh token to verify
 * @returns Decoded token payload
 */
export function verifyRefreshToken(token: string): { userId: string } {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as { userId: string };
  } catch (error) {
    logger.error('Refresh token verification failed', error);
    throw new Error('Invalid refresh token');
  }
}

/**
 * Refreshes an access token using a refresh token
 * @param refreshToken Refresh token
 * @param user User entity
 * @returns New access token
 */
export function refreshAccessToken(refreshToken: string, user: {id: string}): { accessToken: string; expiresIn: number } {
  try {
    const decoded = verifyRefreshToken(refreshToken);
    
    if (decoded.userId !== user.id) {
      logger.warn('Refresh token user mismatch', { tokenUserId: decoded.userId, requestUserId: user.id });
      throw new Error('Invalid refresh token');
    }

    const expiresIn = parseInt(JWT_EXPIRES_IN.replace(/\D/g, '')) * 
      (JWT_EXPIRES_IN.includes('h') ? 3600 : 
       JWT_EXPIRES_IN.includes('m') ? 60 : 86400);

    const payload: JwtPayload = {
      userId: user.id
    };

    const accessTokenOptions: SignOptions = {
      expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      jwtid: crypto.randomUUID()
    };

    const accessToken = jwt.sign(
      payload,
      JWT_SECRET,
      accessTokenOptions
    );

    return { accessToken, expiresIn };
  } catch (error) {
    logger.error('Access token refresh failed', error);
    throw new Error('Failed to refresh access token');
  }
}

/**
 * Extracts token from authorization header
 * @param authHeader Authorization header
 * @returns JWT token or null if not found
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  return authHeader.substring(7);
}

/**
 * Invalidates a token
 * @param token The token to invalidate
 */
export async function invalidateToken(token: string): Promise<void> {
  try {
    const decoded = jwt.decode(token) as JwtPayload & { exp?: number };
    if (!decoded || !decoded.exp) {
      throw new Error('Invalid token format');
    }

    // Calculate remaining time until token expiration
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;

    if (timeUntilExpiry > 0) {
      await TokenBlacklist.add(token, timeUntilExpiry);
    }
  } catch (error) {
    logger.error('Failed to invalidate token:', error);
    throw new Error('Failed to invalidate token');
  }
}

/**
 * Invalidates all tokens for a user
 * @param userId The user ID whose tokens should be invalidated
 * @param tokens Array of tokens to invalidate
 */
export async function invalidateUserTokens(userId: string, tokens: string[]): Promise<void> {
  try {
    await TokenBlacklist.blacklistUserTokens(userId, tokens);
  } catch (error) {
    logger.error('Failed to invalidate user tokens:', error);
    throw new Error('Failed to invalidate user tokens');
  }
}

import { NextFunction, Request,  Response } from "express";

/**
 * Express middleware to ensure req.ip always points to the user's IP address
 * Handles various proxy scenarios and header configurations
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.trustProxy - Whether to trust proxy headers (default: true)
 * @param {string[]} options.headers - Custom headers to check for IP (default: standard headers)
 * @return {Function} Express middleware function
 */
function ipAddressMiddleware(options = {}) {
    // Default options
    const config = {
      trustProxy: true,
      headers: [
        'x-forwarded-for',
        'x-real-ip',
        'cf-connecting-ip', // Cloudflare
        'true-client-ip',   // Akamai
        'x-client-ip',
        'forwarded'
      ],
      ...options
    };
  
    return function(req: Request, res: Response, next: NextFunction) {
      // Store the original IP method
      const originalIpGetter = Object.getOwnPropertyDescriptor(req, 'ip')?.get;
      
      // Function to get the IP address
      const getIpAddress = () => {
        // If we have a direct socket connection and shouldn't trust proxies
        if (!config.trustProxy) {
          return req.socket?.remoteAddress;
        }
        
        // Try to get IP from headers
        for (const header of config.headers) {
          const value = req.headers[header];
          if (value) {
            // Handle comma-separated values (first one is typically the client)
            if (typeof value === 'string' && value.includes(',')) {
              return value.split(',')[0].trim();
            }
            return value;
          }
        }
        
        // Fall back to original Express implementation if it exists
        if (originalIpGetter) {
          return originalIpGetter.call(req);
        }
        
        // Last resort: socket remote address
        return req.socket?.remoteAddress || '0.0.0.0';
      };
      
      // Define a non-configurable property that always returns the correct IP
      Object.defineProperty(req, 'ip', {
        configurable: true,
        get: getIpAddress
      });
      
      next();
    };
  }
  
export {ipAddressMiddleware};
  
  // Example usage:
  // const express = require('express');
  // const ipMiddleware = require('./ip-middleware');
  // const app = express();
  // 
  // // Use the middleware
  // app.use(ipMiddleware());
  // 
  // app.get('/', (req, res) => {
  //   res.send(`Your IP address is: ${req.ip}`);
  // });
  // 
  // app.listen(3000, () => {
  //   console.log('Server running on port 3000');
  // });
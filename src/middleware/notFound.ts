import { RequestHandler } from 'express';
import { NotFound } from '../utils/responses';

export const notFound: RequestHandler = (req, res) => {
  new NotFound('Route not found - '+ req.originalUrl).send(res);
};

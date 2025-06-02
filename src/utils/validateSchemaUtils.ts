import { ZodSchema, ZodError } from 'zod';

type DataSource = 'body' | 'query' | 'params' | 'headers' | 'custom';

interface ValidateOptions<T> {
  schema: ZodSchema<T>;
  from?: DataSource;
  customData?: unknown; // only used if `from` is 'custom'
  onError?: (err: ZodError) => never; // allows overriding error behavior
}

/**
 * Validates incoming request data using Zod and a flexible data source selector.
 *
 * @param req - The request object (can be Express, Fastify, etc.)
 * @param options - Validation options including schema, source, and error handling
 * @returns The parsed & typed data if valid
 */
export function validateSchema<T>(
  req: Record<string, any>,
  options: ValidateOptions<T>
): T {
  const { schema, from = 'body', customData, onError } = options;

  let dataToValidate: any;
  switch (from) {
    case 'body':
    case 'query':
    case 'params':
    case 'headers':
      dataToValidate = req[from];
      break;
    case 'custom':
      dataToValidate = customData;
      break;
    default:
      throw new Error(`Invalid data source: ${from}`);
  }

  const result = schema.safeParse(dataToValidate);

  if (!result.success) {
    if (onError) return onError(result.error);
    throw result.error;
  }

  return result.data;
}

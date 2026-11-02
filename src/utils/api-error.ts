/**
 * Application error with an HTTP status code.
 * Throw this from controllers/services; the central error middleware
 * turns it into a consistent JSON response.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  /** Operational errors are safe to show to clients; programming errors are not. */
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    options: { isOperational?: boolean; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isOperational = options.isOperational ?? true;
    this.details = options.details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message = 'Bad request', details?: unknown): ApiError {
    return new ApiError(400, message, { details });
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict', details?: unknown): ApiError {
    return new ApiError(409, message, { details });
  }

  static internal(message = 'Internal server error', cause?: unknown): ApiError {
    return new ApiError(500, message, { isOperational: false, cause });
  }
}

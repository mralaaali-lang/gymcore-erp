import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import logger from '../config/logger';

/**
 * Custom application error with typed status codes and optional metadata.
 * Usage:
 *   throw new AppError(400, 'Invalid input', { field: 'email' });
 *   throw new AppError(404, 'Gym not found');
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    statusCode: number,
    message: string,
    metadata?: Record<string, unknown>,
    isOperational = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.metadata = metadata;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * 400 Bad Request
 */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', metadata?: Record<string, unknown>) {
    super(400, message, metadata);
  }
}

/**
 * 401 Unauthorized
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', metadata?: Record<string, unknown>) {
    super(401, message, metadata);
  }
}

/**
 * 403 Forbidden
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', metadata?: Record<string, unknown>) {
    super(403, message, metadata);
  }
}

/**
 * 404 Not Found
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', metadata?: Record<string, unknown>) {
    super(404, message, metadata);
  }
}

/**
 * 409 Conflict
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', metadata?: Record<string, unknown>) {
    super(409, message, metadata);
  }
}

/**
 * 429 Too Many Requests
 */
export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests', metadata?: Record<string, unknown>) {
    super(429, message, metadata);
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalError extends AppError {
  constructor(message = 'Internal server error', metadata?: Record<string, unknown>) {
    super(500, message, metadata, false);
  }
}

/**
 * Standardized API error response shape.
 * All errors flow through this handler to ensure a consistent JSON format.
 */
export interface ErrorResponse {
  error: string;
  request_id?: string;
  status_code?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Global error handling middleware.
 *
 * - Operational errors (expected, e.g. validation, not-found) → clean JSON with
 *   the intended status code.
 * - Programming / unexpected errors → 500 with a generic message (no stack
 *   traces leaked to clients).
 * - Always attaches a request_id for traceability.
 * - Sentry is notified for all non-operational errors.
 */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as any).requestId || 'unknown';

  // Already in a failed state — avoid double-send
  if (res.headersSent) {
    return;
  }

  // Handle known AppError subclasses
  if (err instanceof AppError) {
    if (!err.isOperational) {
      Sentry.captureException(err, {
        extra: { requestId, path: req.path, method: req.method },
      });
      logger.error('Non-operational error', {
        requestId,
        statusCode: err.statusCode,
        error: err.message,
        metadata: err.metadata,
      });
    }

    const body: ErrorResponse = {
      error: err.message,
      request_id: requestId,
      status_code: err.statusCode,
    };

    if (err.metadata && Object.keys(err.metadata).length > 0) {
      body.metadata = err.metadata;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // Multer / file-upload errors (usually have a `code` and `field`)
  const multerErr = err as any;
  if (multerErr.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({
      error: 'File too large. Maximum size is 2 MB.',
      request_id: requestId,
      status_code: 400,
    });
    return;
  }
  if (multerErr.code === 'LIMIT_UNEXPECTED_FILE') {
    res.status(400).json({
      error: 'Unexpected file field.',
      request_id: requestId,
      status_code: 400,
    });
    return;
  }

  // Unknown / programming errors — log and send generic 500
  Sentry.captureException(err, {
    extra: { requestId, path: req.path, method: req.method },
  });
  logger.error('Unhandled error', {
    requestId,
    path: req.path,
    method: req.method,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(500).json({
    error: 'Internal server error.',
    request_id: requestId,
    status_code: 500,
  });
}


/**
 * csrf.ts — CSRF Protection middleware for platform routes
 *
 * Protection strategy:
 * - For state-changing requests (POST, PUT, PATCH, DELETE) on /platform/*
 * - Requires a CSRF token sent via X-CSRF-Token header
 * - Token is generated per session and tied to the platform admin session
 * - Uses double-submit cookie pattern: token in cookie must match header
 *
 * This is deliberately simple — no need for a full CSRF library when
 * we control both the API server and the SPA client.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
const CSRF_COOKIE = 'gymcore_csrf';
const CSRF_HEADER = 'x-csrf-token';

/**
 * Generate a CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * CSRF protection middleware
 * - Sets the CSRF cookie on every response if not present
 * - Validates CSRF token on state-changing requests
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Safe methods don't need CSRF protection
  if (SAFE_METHODS.includes(req.method.toUpperCase())) {
    // Ensure the cookie is set for subsequent requests
    if (!req.cookies?.[CSRF_COOKIE]) {
      const token = generateCsrfToken();
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });
    }
    next();
    return;
  }

  // State-changing methods require CSRF validation
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;

  if (!cookieToken || !headerToken) {
    res.status(403).json({
      error: 'CSRF token missing. Ensure cookies and X-CSRF-Token header are sent.',
    });
    return;
  }

  if (cookieToken !== headerToken) {
    res.status(403).json({
      error: 'CSRF token mismatch. Request rejected.',
    });
    return;
  }

  next();
}

/**
 * Middleware to extract CSRF token for the frontend
 * Sets the token in response locals and sets cookie if needed
 */
export function csrfTokenHandler(_req: Request, res: Response): void {
  const token = generateCsrfToken();
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });
  res.json({ csrfToken: token });
}


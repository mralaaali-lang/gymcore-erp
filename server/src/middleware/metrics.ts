import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

const startTime = Date.now();
let requestCount = 0;

export function responseTimeMetrics(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  requestCount++;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger.log(level, `${req.method} ${req.originalUrl}`, {
      requestId: (req as any).requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: duration,
    });
  });

  next();
}

export function healthCheck(_req: Request, res: Response): void {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  res.json({
    status: 'healthy',
    uptime_seconds: uptime,
    uptime_human: formatUptime(uptime),
    request_count: requestCount,
    timestamp: new Date().toISOString(),
  });
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

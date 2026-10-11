import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV === 'development';

export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 5000 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
});

export const qrRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 500 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'QR scan rate exceeded. Slow down.' },
});

// Gym provisioning does a bcrypt hash (cost 12, deliberately CPU-expensive)
// plus multiple writes — even an authenticated platform admin shouldn't be
// able to hammer this endpoint (compromised token, buggy script, etc.).
export const platformWriteRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 500 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many gym-management actions. Please slow down.' },
});

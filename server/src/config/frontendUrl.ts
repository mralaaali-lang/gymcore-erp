const DEPLOYED_ENVIRONMENTS = new Set(['production', 'staging']);

/**
 * Return the configured browser app URL for links sent by email.
 * Local Docker runs on :9000. Staging/production must explicitly provide an
 * HTTPS URL so a password-reset token can never be mailed to localhost/HTTP.
 */
export function getFrontendUrl(): string | null {
  const environment = (process.env.NODE_ENV || 'development').toLowerCase();
  const requiresHttps = DEPLOYED_ENVIRONMENTS.has(environment);
  const configured = process.env.FRONTEND_URL?.trim();

  if (!configured) {
    return requiresHttps ? null : 'http://localhost:9000';
  }

  try {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (requiresHttps && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.search || url.hash) return null;

    const hostname = url.hostname.toLowerCase();
    if (requiresHttps && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return null;

    const basePath = url.pathname.replace(/\/+$/, '');
    return `${url.origin}${basePath}`;
  } catch {
    return null;
  }
}

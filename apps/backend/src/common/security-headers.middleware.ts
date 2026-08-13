import type { Request, Response, NextFunction } from 'express';

/**
 * Baseline security headers for every backend response (SECURITY-REVIEW
 * SAV-10). The backend serves JSON, media streams, and the Swagger UI; the
 * CSP allows the inline script/style Swagger UI bootstraps with while still
 * blocking plugin content, base hijacks, and cross-origin framing.
 *
 * HSTS is intentionally NOT set here: TLS terminates at the operator's
 * reverse proxy, which is the only place that knows whether HTTPS is
 * consistently enforced.
 */
export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
    ].join('; '),
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()',
  );
  next();
}

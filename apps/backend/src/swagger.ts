import { DocumentBuilder } from '@nestjs/swagger';

/**
 * Shared OpenAPI config used by the running server (main.ts) and the
 * offline export script (scripts/export-openapi.ts), so the exported spec
 * is always identical to what /api/docs-json serves.
 */
export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Bookmark API')
    .setDescription(
      `
## Overview

Bookmark is a self-hosted audiobook and ebook management platform. This API provides access to your media library, playback progress, and user settings.

## Authentication

The API supports two authentication methods:

### 1. Session Cookies (Recommended for Web)

For browser-based applications, use session-based authentication:

1. **Sign up** (first user becomes admin):
   \`\`\`
   POST /api/auth/sign-up/email
   Content-Type: application/json

   {
     "name": "Your Name",
     "email": "user@example.com",
     "password": "your-password"
   }
   \`\`\`

2. **Sign in**:
   \`\`\`
   POST /api/auth/sign-in/email
   Content-Type: application/json

   {
     "email": "user@example.com",
     "password": "your-password"
   }
   \`\`\`

3. The response sets a session cookie that is automatically sent with subsequent requests.

4. **Sign out**:
   \`\`\`
   POST /api/auth/sign-out
   \`\`\`

### 2. API Keys (Recommended for Programmatic Access)

For scripts, mobile apps, or third-party integrations, use API keys:

1. Create an API key via the settings page or API
2. Include the key in one of the following ways:

   **Authorization Header (recommended):**
   \`\`\`
   Authorization: Bearer bkmrk_your_api_key_here
   \`\`\`

   **Query Parameter (for image/asset URLs):**
   \`\`\`
   GET /api/audiobooks/:id/cover?token=bkmrk_your_api_key_here
   \`\`\`

   Use query parameter authentication when loading images in contexts that cannot set custom headers (e.g., \`<img>\` tags, mobile app image loaders). Note that query parameters may be logged by web servers.

API keys have the same permissions as the user who created them.

## Common Response Codes

| Code | Description |
|------|-------------|
| 200  | Success |
| 201  | Created |
| 204  | No Content (successful deletion) |
| 400  | Bad Request (validation error) |
| 401  | Unauthorized (missing or invalid authentication) |
| 403  | Forbidden (insufficient permissions) |
| 404  | Not Found |
| 500  | Internal Server Error |

## Rate Limiting

There are no rate limits for self-hosted instances. Be mindful of your server resources.
    `.trim(),
    )
    .setVersion('1.0')
    .addCookieAuth(
      'better-auth.session_token',
      {
        type: 'apiKey',
        in: 'cookie',
        name: 'better-auth.session_token',
        description: 'Session cookie set by the authentication endpoints',
      },
      'better-auth.session_token',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        description: 'API key prefixed with bkmrk_',
      },
      'api-key',
    )
    .addBasicAuth(
      {
        type: 'http',
        scheme: 'basic',
        description:
          'HTTP Basic auth for OPDS endpoints — use any username with an API key (bkmrk_…) as the password',
      },
      'basic',
    )
    .addTag('Audiobooks', 'Manage your audiobook library')
    .addTag(
      'Audiobook Bookmarks',
      'Personal named timestamps saved inside audiobooks',
    )
    .addTag('Ebooks', 'Manage your ebook library')
    .addTag('Progress', 'Track reading/listening progress')
    .addTag('Hardcover', 'Hardcover.app integration')
    .addTag('Users', 'User management (admin only)')
    .addTag('Settings', 'Application settings')
    .addTag('Stats', 'Aggregate server statistics for dashboards')
    .build();
}

import { ConfigService } from '@nestjs/config';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, apiKey, genericOAuth } from 'better-auth/plugins';
import { createAuthMiddleware } from 'better-auth/api';
import { count, eq } from 'drizzle-orm';
import * as schema from './schema';
import { userPermissions } from '../users/schema';
import { appSettings } from '../app-settings/schema';

export interface OidcConfig {
  enabled: boolean;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
}

function getOidcConfig(configService: ConfigService): OidcConfig | null {
  const enabled = configService.get<string>('OIDC_ENABLED');
  if (enabled !== 'true') {
    return null;
  }

  const issuerUrl = configService.get<string>('OIDC_ISSUER_URL');
  const clientId = configService.get<string>('OIDC_CLIENT_ID');
  const clientSecret = configService.get<string>('OIDC_CLIENT_SECRET');

  if (!issuerUrl || !clientId || !clientSecret) {
    return null;
  }

  return {
    enabled: true,
    issuerUrl,
    clientId,
    clientSecret,
  };
}

/**
 * Creates a better-auth instance with admin plugin.
 * This is used by the AuthModule to handle authentication.
 *
 * The first user to sign up is automatically promoted to admin.
 */
export function createAuthInstance(
  database: NodePgDatabase,
  configService: ConfigService,
) {
  const oidcConfig = getOidcConfig(configService);

  return betterAuth({
    trustedOrigins: [configService.getOrThrow<string>('UI_URL')],
    emailAndPassword: {
      enabled: true,
    },
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema,
    }),
    plugins: [
      admin({
        defaultRole: 'user',
      }),
      apiKey({
        defaultPrefix: 'bkmrk_',
        enableMetadata: true,
        enableSessionForAPIKeys: true,
        // Rate limiting not needed for this application
        rateLimit: { enabled: false },
        // Support x-api-key header, Authorization: Bearer/Basic, and query param token
        customAPIKeyGetter: (ctx) => {
          const headers = ctx.request?.headers as
            | Record<string, string>
            | undefined;

          // Check query parameter first (useful for image URLs in mobile apps)
          const url = ctx.request?.url;
          if (url) {
            try {
              const urlObj = new URL(url, 'http://localhost');
              const tokenParam = urlObj.searchParams.get('token');
              if (tokenParam?.startsWith('bkmrk_')) {
                return tokenParam;
              }
            } catch {
              // Invalid URL, continue to header checks
            }
          }

          if (!headers) return null;

          // Check x-api-key header
          const xApiKey = headers['x-api-key'];
          if (xApiKey?.startsWith('bkmrk_')) {
            return xApiKey;
          }

          // Check Authorization header for Bearer token
          const authHeader = headers['authorization'];
          if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            if (token.startsWith('bkmrk_')) {
              return token;
            }
          }

          // Check Authorization header for Basic auth (password is API key)
          if (authHeader?.startsWith('Basic ')) {
            try {
              const base64 = authHeader.slice(6);
              const decoded = Buffer.from(base64, 'base64').toString('utf-8');
              const [, password] = decoded.split(':');
              if (password?.startsWith('bkmrk_')) {
                return password;
              }
            } catch {
              // Invalid base64, ignore
            }
          }

          return null;
        },
      }),
      ...(oidcConfig
        ? [
            genericOAuth({
              config: [
                {
                  providerId: 'oidc',
                  discoveryUrl: `${oidcConfig.issuerUrl}/.well-known/openid-configuration`,
                  clientId: oidcConfig.clientId,
                  clientSecret: oidcConfig.clientSecret,
                  scopes: ['openid', 'profile', 'email'],
                },
              ],
            }),
          ]
        : []),
    ],
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        // Handle new user setup for both sign-up and OAuth callback
        // Note: genericOAuth uses /oauth2/callback/:providerId, not /callback/:providerId
        if (
          ctx.path.startsWith('/sign-up') ||
          ctx.path.startsWith('/callback') ||
          ctx.path.startsWith('/oauth2/callback')
        ) {
          const newSession = ctx.context.newSession;
          if (newSession) {
            const userId = newSession.user.id;

            // Check if this is the first user (should become admin)
            const [result] = await database
              .select({ count: count() })
              .from(schema.user);
            const isFirstUser = result.count === 1;

            if (isFirstUser) {
              // First user becomes admin with all permissions
              await ctx.context.internalAdapter.updateUser(userId, {
                role: 'admin',
              });
              await database
                .insert(userPermissions)
                .values({
                  userId,
                  canEditMetadata: true,
                  canUpload: true,
                  canDelete: true,
                  canGenerateApiKeys: true,
                  canRequestContent: true,
                })
                .onConflictDoNothing();
            } else {
              // Check if permissions already exist for this user
              const existingPerms = await database
                .select({ userId: userPermissions.userId })
                .from(userPermissions)
                .where(eq(userPermissions.userId, userId))
                .limit(1);

              if (existingPerms.length === 0) {
                // Get default permissions from app settings
                const settings = await database
                  .select({
                    defaultCanEditMetadata: appSettings.defaultCanEditMetadata,
                    defaultCanUpload: appSettings.defaultCanUpload,
                    defaultCanDelete: appSettings.defaultCanDelete,
                    defaultCanGenerateApiKeys:
                      appSettings.defaultCanGenerateApiKeys,
                    defaultCanRequestContent:
                      appSettings.defaultCanRequestContent,
                  })
                  .from(appSettings)
                  .where(eq(appSettings.id, 'app_settings'))
                  .limit(1);

                const defaults = settings[0] || {
                  defaultCanEditMetadata: false,
                  defaultCanUpload: false,
                  defaultCanDelete: false,
                  defaultCanGenerateApiKeys: false,
                  defaultCanRequestContent: false,
                };

                // Create permissions with defaults
                await database.insert(userPermissions).values({
                  userId,
                  canEditMetadata: defaults.defaultCanEditMetadata,
                  canUpload: defaults.defaultCanUpload,
                  canDelete: defaults.defaultCanDelete,
                  canGenerateApiKeys: defaults.defaultCanGenerateApiKeys,
                  canRequestContent: defaults.defaultCanRequestContent,
                });
              }
            }
          }
        }
      }),
    },
  });
}

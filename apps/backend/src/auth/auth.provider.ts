import { ConfigService } from '@nestjs/config';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, genericOAuth } from 'better-auth/plugins';
import { apiKey } from '@better-auth/api-key';
import { createAuthMiddleware, APIError } from 'better-auth/api';
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
        // Match CreateApiKeyDto's 100-char cap; the plugin default of 32
        // rejects names like "Bookmark iOS – iPhone (2026-07-04)".
        maximumNameLength: 100,
        // better-auth 1.6 renamed the owner field userId -> referenceId; map
        // it back onto our drizzle property so the user_id column (and every
        // query in ApiKeysService/ApiTokenMiddleware) keeps working unchanged.
        schema: {
          apikey: {
            fields: {
              referenceId: 'userId',
            },
          },
        },
        // Rate limiting not needed for this application
        rateLimit: { enabled: false },
        // Support x-api-key header and Authorization: Bearer/Basic.
        // Query-string tokens are deliberately NOT supported: URLs end up in
        // application logs, proxy logs, and browser history, which would leak
        // the long-lived credential (see SECURITY-REVIEW SAV-07).
        customAPIKeyGetter: (ctx) => {
          const headers = ctx.request?.headers as
            Record<string, string> | undefined;

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
      before: createAuthMiddleware(async (ctx) => {
        // Enforce the "email/password authentication" admin setting at the
        // API itself — hiding the form in the UI is presentation, not policy.
        if (ctx.path === '/sign-in/email' || ctx.path === '/sign-up/email') {
          const [settings] = await database
            .select({
              emailPasswordEnabled: appSettings.emailPasswordEnabled,
            })
            .from(appSettings)
            .where(eq(appSettings.id, 'app_settings'))
            .limit(1);

          if (settings && !settings.emailPasswordEnabled) {
            // Safety valve: never lock an empty instance out of first-user
            // setup (mirrors SignupGuard).
            const [existing] = await database
              .select({ count: count() })
              .from(schema.user);
            if (existing.count > 0) {
              throw new APIError('FORBIDDEN', {
                message: 'Email/password authentication is disabled',
              });
            }
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        // Handle new user setup for both sign-up and OAuth callback
        // Note: genericOAuth uses /oauth2/callback/:providerId, not /callback/:providerId
        const isOauthCallback =
          ctx.path.startsWith('/callback') ||
          ctx.path.startsWith('/oauth2/callback');
        if (ctx.path.startsWith('/sign-up') || isOauthCallback) {
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
                  canGenerateAudiobooks: true,
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
                const [settings] = await database
                  .select({
                    defaultCanEditMetadata: appSettings.defaultCanEditMetadata,
                    defaultCanUpload: appSettings.defaultCanUpload,
                    defaultCanDelete: appSettings.defaultCanDelete,
                    defaultCanGenerateApiKeys:
                      appSettings.defaultCanGenerateApiKeys,
                    defaultCanRequestContent:
                      appSettings.defaultCanRequestContent,
                    defaultCanGenerateAudiobooks:
                      appSettings.defaultCanGenerateAudiobooks,
                    oidcAutoCreateUsers: appSettings.oidcAutoCreateUsers,
                  })
                  .from(appSettings)
                  .where(eq(appSettings.id, 'app_settings'))
                  .limit(1);

                // Enforce the OIDC account-creation policy server-side. This
                // branch only runs for identities that did not exist before
                // this callback (no permissions row yet).
                const oidcMode = settings?.oidcAutoCreateUsers ?? 'auto';
                if (isOauthCallback && oidcMode === 'disabled') {
                  // Unknown identities may not get an account: remove the
                  // just-created user — sessions and linked accounts cascade,
                  // so the cookie issued by this callback is dead on arrival.
                  await database
                    .delete(schema.user)
                    .where(eq(schema.user.id, userId));
                  return;
                }

                const defaults = settings || {
                  defaultCanEditMetadata: false,
                  defaultCanUpload: false,
                  defaultCanDelete: false,
                  defaultCanGenerateApiKeys: false,
                  defaultCanRequestContent: false,
                  defaultCanGenerateAudiobooks: false,
                };

                // Create permissions with defaults
                await database.insert(userPermissions).values({
                  userId,
                  canEditMetadata: defaults.defaultCanEditMetadata,
                  canUpload: defaults.defaultCanUpload,
                  canDelete: defaults.defaultCanDelete,
                  canGenerateApiKeys: defaults.defaultCanGenerateApiKeys,
                  canRequestContent: defaults.defaultCanRequestContent,
                  canGenerateAudiobooks: defaults.defaultCanGenerateAudiobooks,
                });

                if (isOauthCallback && oidcMode === 'pending') {
                  // The account exists but must be approved by an admin
                  // before it is usable: ban it (the admin plugin blocks
                  // banned users from signing in) and revoke the session
                  // issued by this callback. Unbanning approves the account.
                  await database
                    .update(schema.user)
                    .set({
                      banned: true,
                      banReason: 'Pending admin approval',
                    })
                    .where(eq(schema.user.id, userId));
                  await database
                    .delete(schema.session)
                    .where(eq(schema.session.userId, userId));
                }
              }
            }
          }
        }
      }),
    },
  });
}

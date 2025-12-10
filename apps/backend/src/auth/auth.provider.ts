import { ConfigService } from '@nestjs/config';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, apiKey, genericOAuth } from 'better-auth/plugins';
import { createAuthMiddleware } from 'better-auth/api';
import { count } from 'drizzle-orm';
import * as schema from './schema';

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
        // Handle first user admin promotion for both sign-up and OAuth callback
        if (
          ctx.path.startsWith('/sign-up') ||
          ctx.path.startsWith('/callback')
        ) {
          const newSession = ctx.context.newSession;
          if (newSession) {
            const [result] = await database
              .select({ count: count() })
              .from(schema.user);
            if (result.count === 1) {
              await ctx.context.internalAdapter.updateUser(newSession.user.id, {
                role: 'admin',
              });
            }
          }
        }
      }),
    },
  });
}

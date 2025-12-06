import { ConfigService } from '@nestjs/config';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, apiKey } from 'better-auth/plugins';
import { createAuthMiddleware } from 'better-auth/api';
import { count } from 'drizzle-orm';
import * as schema from './schema';

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
    ],
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path.startsWith('/sign-up')) {
          const newSession = ctx.context.newSession;
          if (newSession) {
            const [result] = await database
              .select({ count: count() })
              .from(schema.user);
            if (result.count === 1) {
              await ctx.context.internalAdapter.updateUser(
                newSession.user.id,
                { role: 'admin' },
              );
            }
          }
        }
      }),
    },
  });
}

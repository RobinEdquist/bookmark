import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, apiKey } from 'better-auth/plugins';

export const auth = betterAuth({
  database: drizzleAdapter({}, { provider: 'pg' }),
  plugins: [
    admin({
      defaultRole: 'user',
    }),
    apiKey(),
  ],
});

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthGuard, AuthModule } from '@thallesp/nestjs-better-auth';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { createAuthMiddleware } from 'better-auth/api';
import { DATABASE_CONNECTION } from './database/database-connection.constants';
import { UsersModule } from './users/users.module';
import { AppSettingsModule } from './app-settings/app-settings.module';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { count } from 'drizzle-orm';
import { user } from './auth/schema';
import { SignupGuard } from './auth/signup.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot(),
    UsersModule,
    AppSettingsModule,
    AuthModule.forRootAsync({
      imports: [DatabaseModule, ConfigModule],
      useFactory: (database: NodePgDatabase, configService: ConfigService) => ({
        auth: betterAuth({
          trustedOrigins: [configService.getOrThrow<string>('UI_URL')],
          emailAndPassword: {
            enabled: true,
          },
          database: drizzleAdapter(database, {
            provider: 'pg',
          }),
          plugins: [
            admin({
              defaultRole: 'user',
            }),
          ],
          hooks: {
            after: createAuthMiddleware(async (ctx) => {
              if (ctx.path.startsWith('/sign-up')) {
                const newSession = ctx.context.newSession;
                if (newSession) {
                  const [result] = await database
                    .select({ count: count() })
                    .from(user);
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
        }),
      }),
      inject: [DATABASE_CONNECTION, ConfigService],
    }),
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: SignupGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}

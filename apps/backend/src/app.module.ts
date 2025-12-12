import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { AppDataModule } from './app-data/app-data.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from './database/database-connection.constants';
import { UsersModule } from './users/users.module';
import { AppSettingsModule } from './app-settings/app-settings.module';
import { FilesystemModule } from './filesystem/filesystem.module';
import { AudiobooksModule } from './audiobooks/audiobooks.module';
import { EbooksModule } from './ebooks/ebooks.module';
import { ImportErrorsModule } from './import-errors/import-errors.module';
import { LibraryWatcherModule } from './library-watcher/library-watcher.module';
import { HardcoverModule } from './hardcover/hardcover.module';
import { LibraryModule } from './library/library.module';
import { SeriesModule } from './series/series.module';
import { EventsModule } from './events/events.module';
import { ProgressModule } from './progress/progress.module';
import { TasksModule } from './tasks/tasks.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { PeopleModule } from './people/people.module';
import { RestoreModule } from './restore/restore.module';
import { HealthModule } from './health/health.module';
import { APP_GUARD } from '@nestjs/core';
import { SignupGuard } from './auth/signup.guard';
import { createAuthInstance } from './auth/auth.provider';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';
        const logLevel = configService.get('LOG_LEVEL', 'info');

        return {
          pinoHttp: {
            level: logLevel,
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                  },
                },
            customProps: (req) => {
              const session = (req as { session?: { user?: { id: string; email: string } } }).session;
              if (session?.user) {
                return {
                  actor: {
                    id: session.user.id,
                    email: session.user.email,
                  },
                };
              }
              return { actor: { id: 'system', email: null } };
            },
            customLogLevel: (
              _req: unknown,
              res: { statusCode: number },
              err: unknown,
            ) => {
              if (res.statusCode >= 500 || err) return 'error';
              if (res.statusCode >= 400) return 'warn';
              return 'info';
            },
            autoLogging: {
              ignore: (req: { url?: string }) => req.url === '/api/health',
            },
          },
        };
      },
    }),
    AppDataModule,
    DatabaseModule,
    AuthModule.forRootAsync({
      imports: [DatabaseModule, ConfigModule],
      useFactory: (database: NodePgDatabase, configService: ConfigService) => ({
        auth: createAuthInstance(database, configService),
      }),
      inject: [DATABASE_CONNECTION, ConfigService],
    }),
    UsersModule,
    AppSettingsModule,
    FilesystemModule,
    AudiobooksModule,
    EbooksModule,
    ImportErrorsModule,
    LibraryWatcherModule,
    HardcoverModule,
    LibraryModule,
    SeriesModule,
    EventsModule,
    ProgressModule,
    TasksModule,
    ApiKeysModule,
    PeopleModule,
    RestoreModule,
    HealthModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: SignupGuard,
    },
  ],
})
export class AppModule {}

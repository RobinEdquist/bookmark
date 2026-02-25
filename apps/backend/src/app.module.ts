import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import pino from 'pino';
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
import { AudnexusModule } from './audnexus/audnexus.module';
import { LibraryModule } from './library/library.module';
import { SeriesModule } from './series/series.module';
import { EventsModule } from './events/events.module';
import { ProgressModule } from './progress/progress.module';
import { EbookProgressModule } from './ebook-progress/ebook-progress.module';
import { TasksModule } from './tasks/tasks.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { PeopleModule } from './people/people.module';
import { RestoreModule } from './restore/restore.module';
import { HealthModule } from './health/health.module';
import { MamClientModule } from './mam-client';
import { RequestsModule } from './requests';
import { ListsModule } from './lists/lists.module';
import { GrFinderModule } from './gr-finder/gr-finder.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { GenresModule } from './genres/genres.module';
import { UserProfileModule } from './user-profile/user-profile.module';
import { APP_GUARD } from '@nestjs/core';
import { SignupGuard } from './auth/signup.guard';
import { CombinedAuthGuard } from './common/guards/combined-auth.guard';
import { createAuthInstance } from './auth/auth.provider';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    CommonModule,
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';
        const logLevel = configService.get('LOG_LEVEL', 'info');

        // Create multistream to route errors/fatal to stderr, rest to stdout
        const streams: pino.StreamEntry[] = [
          // stdout for info, debug, trace, warn
          { level: 'trace', stream: process.stdout },
          // stderr for error and fatal (overwrites lower levels for these)
          { level: 'error', stream: process.stderr },
        ];

        return {
          pinoHttp: {
            level: logLevel,
            // In development, use pino-pretty transport
            // In production, use multistream for stderr/stdout split
            ...(isProduction
              ? { stream: pino.multistream(streams, { dedupe: true }) }
              : {
                  transport: {
                    target: 'pino-pretty',
                    options: {
                      colorize: true,
                      singleLine: true,
                      translateTime: 'SYS:standard',
                      ignore: 'pid,hostname',
                      destination: 1, // stdout by default
                    },
                  },
                }),
            customProps: (req) => {
              const typedReq = req as {
                session?: { user?: { id: string; email: string } };
                apiTokenUser?: { id: string; email: string };
              };
              // Check cookie session first, then API token user
              const user = typedReq.session?.user || typedReq.apiTokenUser;
              if (user) {
                return {
                  actor: {
                    id: user.id,
                    email: user.email,
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
      // Disable global auth guard so we can handle API token auth ourselves
      // Better Auth's guard only checks session.user, not apiTokenUser
      // NOTE: This must be at top level, not inside useFactory return!
      disableGlobalAuthGuard: true,
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
    AudnexusModule,
    LibraryModule,
    SeriesModule,
    EventsModule,
    ProgressModule,
    EbookProgressModule,
    TasksModule,
    ApiKeysModule,
    PeopleModule,
    RestoreModule,
    HealthModule,
    MamClientModule,
    RequestsModule,
    ListsModule,
    GrFinderModule,
    AnnouncementsModule,
    GenresModule,
    UserProfileModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: SignupGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CombinedAuthGuard,
    },
  ],
})
export class AppModule {}

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
import { ComicsModule } from './comics/comics.module';
import { ImportErrorsModule } from './import-errors/import-errors.module';
import { LibraryWatcherModule } from './library-watcher/library-watcher.module';
import { HardcoverModule } from './hardcover/hardcover.module';
import { ComicvineModule } from './comicvine/comicvine.module';
import { TtsModule } from './tts/tts.module';
import { AudnexusModule } from './audnexus/audnexus.module';
import { ItunesModule } from './itunes/itunes.module';
import { LibraryModule } from './library/library.module';
import { SeriesModule } from './series/series.module';
import { EventsModule } from './events/events.module';
import { ProgressModule } from './progress/progress.module';
import { EbookProgressModule } from './ebook-progress/ebook-progress.module';
import { ComicProgressModule } from './comic-progress/comic-progress.module';
import { TasksModule } from './tasks/tasks.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { MobileAuthModule } from './mobile-auth/mobile-auth.module';
import { PeopleModule } from './people/people.module';
import { RestoreModule } from './restore/restore.module';
import { HealthModule } from './health/health.module';
import { VersionModule } from './version/version.module';
import { TrackerModule } from './tracker';
import { RequestsModule } from './requests';
import { ListsModule } from './lists/lists.module';
import { GrFinderModule } from './gr-finder/gr-finder.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { GenresModule } from './genres/genres.module';
import { UserProfileModule } from './user-profile/user-profile.module';
import { StatsModule } from './stats/stats.module';
import { MetricsModule } from './metrics/metrics.module';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SignupGuard } from './auth/signup.guard';
import { CombinedAuthGuard } from './common/guards/combined-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
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

        // Route every log to stdout, and additionally mirror error/fatal to stderr.
        const streams: pino.StreamEntry[] = [
          { level: 'trace', stream: process.stdout },
          { level: 'error', stream: process.stderr },
        ];

        return {
          pinoHttp: {
            level: logLevel,
            // In development, use pino-pretty transport
            // In production, use multistream for stderr/stdout split
            ...(isProduction
              ? { stream: pino.multistream(streams) }
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
            // Emit level labels ("info") instead of numbers (30) so log
            // viewers like Dozzle can color-code and filter by level.
            formatters: {
              level: (label: string) => ({ level: label }),
            },
            // The default serializers dump every request/response header —
            // including session cookies — into each log line. Keep only
            // what's needed to identify the request.
            serializers: {
              req: (req: {
                id?: unknown;
                method?: string;
                url?: string;
                remoteAddress?: string;
              }) => ({
                id: req.id,
                method: req.method,
                url: req.url,
                remoteAddress: req.remoteAddress,
              }),
              res: (res: { statusCode?: number }) => ({
                statusCode: res.statusCode,
              }),
            },
            // pino-http evaluates customProps twice per request: once when
            // the request comes in (before auth guards have resolved the
            // session, so the actor would always be "system") and once when
            // the response finishes. Emitting props from both calls is what
            // used to produce duplicate `actor` keys — so only answer the
            // finish-time call, when the session is known.
            customProps: (req, res) => {
              if (!(res as { writableEnded?: boolean }).writableEnded) {
                return {};
              }
              const typedReq = req as {
                session?: { user?: { id: string; email: string } };
                apiTokenUser?: { id: string; email: string };
              };
              // Check cookie session first, then API token user
              const user = typedReq.session?.user || typedReq.apiTokenUser;
              return {
                actor: user
                  ? { id: user.id, email: user.email }
                  : { id: 'system', email: null },
              };
            },
            customSuccessMessage: (
              req: { method?: string; url?: string },
              res: { statusCode?: number },
              responseTime: number,
            ) =>
              `${req.method} ${req.url} → ${res.statusCode} (${responseTime}ms)`,
            customErrorMessage: (
              req: { method?: string; url?: string },
              res: { statusCode?: number },
            ) => `${req.method} ${req.url} → ${res.statusCode}`,
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
    ComicsModule,
    ImportErrorsModule,
    LibraryWatcherModule,
    HardcoverModule,
    ComicvineModule,
    TtsModule,
    AudnexusModule,
    ItunesModule,
    LibraryModule,
    SeriesModule,
    EventsModule,
    ProgressModule,
    EbookProgressModule,
    ComicProgressModule,
    TasksModule,
    ApiKeysModule,
    MobileAuthModule,
    PeopleModule,
    RestoreModule,
    HealthModule,
    VersionModule,
    TrackerModule,
    RequestsModule,
    ListsModule,
    GrFinderModule,
    AnnouncementsModule,
    GenresModule,
    UserProfileModule,
    StatsModule,
    MetricsModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
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

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from './database/database-connection.constants';
import { UsersModule } from './users/users.module';
import { AppSettingsModule } from './app-settings/app-settings.module';
import { FilesystemModule } from './filesystem/filesystem.module';
import { AudiobooksModule } from './audiobooks/audiobooks.module';
import { ImportErrorsModule } from './import-errors/import-errors.module';
import { LibraryWatcherModule } from './library-watcher/library-watcher.module';
import { HardcoverModule } from './hardcover/hardcover.module';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { SignupGuard } from './auth/signup.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { createAuthInstance } from './auth/auth.provider';

@Module({
  imports: [
    ConfigModule.forRoot(),
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
    ImportErrorsModule,
    LibraryWatcherModule,
    HardcoverModule,
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

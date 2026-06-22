import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DATABASE_CONNECTION } from './database-connection.constants';
import { DatabaseIntegrityService } from './database-integrity.service';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as authSchema from '../auth/schema';
import * as appSettingsSchema from '../app-settings/schema';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as comicsSchema from '../comics/schema';
import * as ebookProgressSchema from '../ebook-progress/schema';
import * as comicProgressSchema from '../comic-progress/schema';
import * as importErrorsSchema from '../import-errors/schema';
import * as listsSchema from '../lists/schema';
import * as announcementsSchema from '../announcements/schema';
import * as comicvineSchema from '../comicvine/schema';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (configService: ConfigService) => {
        const pool = new Pool({
          connectionString: configService.getOrThrow<string>('DATABASE_URL'),
        });
        return drizzle(pool, {
          schema: {
            ...authSchema,
            ...appSettingsSchema,
            ...audiobooksSchema,
            ...ebooksSchema,
            ...comicsSchema,
            ...ebookProgressSchema,
            ...comicProgressSchema,
            ...importErrorsSchema,
            ...listsSchema,
            ...announcementsSchema,
            ...comicvineSchema,
          },
        });
      },
      inject: [ConfigService],
    },
    DatabaseIntegrityService,
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}

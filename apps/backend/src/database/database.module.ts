import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DATABASE_CONNECTION } from './database-connection.constants';
import { DatabaseIntegrityService } from './database-integrity.service';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as authSchema from '../auth/schema';
import * as apiKeySchema from '../auth/api-key.schema';
import * as appSettingsSchema from '../app-settings/schema';
import * as audiobooksSchema from '../audiobooks/schema';
import * as audiobookBookmarksSchema from '../audiobook-bookmarks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as comicsSchema from '../comics/schema';
import * as progressSchema from '../progress/schema';
import * as ebookProgressSchema from '../ebook-progress/schema';
import * as comicProgressSchema from '../comic-progress/schema';
import * as importErrorsSchema from '../import-errors/schema';
import * as listsSchema from '../lists/schema';
import * as announcementsSchema from '../announcements/schema';
import * as comicvineSchema from '../comicvine/schema';
import * as ttsSchema from '../tts/schema';
import * as usersSchema from '../users/schema';
import * as requestsSchema from '../requests/schema';
import * as hardcoverSchema from '../hardcover/schema';
import * as grFinderSchema from '../gr-finder/schema';

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
            ...apiKeySchema,
            ...appSettingsSchema,
            ...audiobooksSchema,
            ...audiobookBookmarksSchema,
            ...ebooksSchema,
            ...comicsSchema,
            ...progressSchema,
            ...ebookProgressSchema,
            ...comicProgressSchema,
            ...importErrorsSchema,
            ...listsSchema,
            ...announcementsSchema,
            ...comicvineSchema,
            ...ttsSchema,
            ...usersSchema,
            ...requestsSchema,
            ...hardcoverSchema,
            ...grFinderSchema,
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

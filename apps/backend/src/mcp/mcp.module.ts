import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { AudiobooksModule } from '../audiobooks/audiobooks.module';
import { EbooksModule } from '../ebooks/ebooks.module';
import { ComicsModule } from '../comics/comics.module';
import { ComicvineModule } from '../comicvine/comicvine.module';
import { SeriesModule } from '../series/series.module';
import { HardcoverModule } from '../hardcover/hardcover.module';
import { GrFinderModule } from '../gr-finder/gr-finder.module';
import { AudnexusModule } from '../audnexus/audnexus.module';
import { ItunesModule } from '../itunes/itunes.module';
import { MetadataGapsModule } from '../metadata-gaps/metadata-gaps.module';
import { VersionModule } from '../version/version.module';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server.factory';
import { McpAccessService } from './mcp-access.service';
import { McpLibraryService } from './mcp-library.service';
import { McpInspectService } from './mcp-inspect.service';
import { McpViewService } from './mcp-view.service';
import { McpExternalService } from './mcp-external.service';

/**
 * The Bookmark MCP server at /api/mcp. Read-only for now; see
 * docs/mcp-capabilities.md for the plan and what each tool covers.
 */
@Module({
  imports: [
    DatabaseModule,
    AppSettingsModule,
    AudiobooksModule,
    EbooksModule,
    ComicsModule,
    ComicvineModule,
    SeriesModule,
    HardcoverModule,
    GrFinderModule,
    AudnexusModule,
    ItunesModule,
    MetadataGapsModule,
    VersionModule,
  ],
  controllers: [McpController],
  providers: [
    McpServerFactory,
    McpAccessService,
    McpLibraryService,
    McpInspectService,
    McpViewService,
    McpExternalService,
  ],
})
export class McpModule {}

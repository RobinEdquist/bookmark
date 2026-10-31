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
import { McpChangeLogService } from './mcp-change-log.service';
import { McpEntityStore } from './mcp-entity-store';
import { McpEditService } from './mcp-edit.service';
import { McpStructureService } from './mcp-structure.service';
import { McpCollectionsService } from './mcp-collections.service';
import { McpUndoService } from './mcp-undo.service';
import { McpLinkService } from './mcp-link.service';
import { McpWriteTools } from './mcp-write-tools';

/**
 * The Bookmark MCP server at /api/mcp: tools to find, inspect and fix
 * library metadata, with every write in the change log. See
 * docs/mcp-capabilities.md for what each tool covers.
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
    McpChangeLogService,
    McpEntityStore,
    McpEditService,
    McpStructureService,
    McpCollectionsService,
    McpUndoService,
    McpLinkService,
    McpWriteTools,
  ],
})
export class McpModule {}

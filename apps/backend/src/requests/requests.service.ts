import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, or, inArray, isNull } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as requestsSchema from './schema';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as authSchema from '../auth/schema';
import { MamClientService } from '../mam-client';
import {
  CreateRequestDto,
  RejectRequestDto,
  RequestResponseDto,
  MamSearchResultDto,
  SearchMamResponseDto,
} from './dto';
import { RequestStatus, ContentType } from './schema';

type CombinedSchema = typeof requestsSchema &
  typeof audiobooksSchema &
  typeof ebooksSchema &
  typeof authSchema;

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<CombinedSchema>,
    private mamClient: MamClientService,
  ) {}

  /**
   * Parse MAM info fields (author_info, narrator_info, series_info)
   * These come as JSON objects like {"111371":"Author Name"} or "{}"
   * Returns comma-separated names or null if empty
   */
  private parseMamInfoField(
    infoField: string | null | undefined,
  ): string | null {
    if (!infoField || infoField === '{}') {
      return null;
    }

    try {
      const parsed = JSON.parse(infoField);
      if (typeof parsed === 'object' && parsed !== null) {
        const values = Object.values(parsed) as string[];
        if (values.length === 0) {
          return null;
        }
        // Decode HTML entities and join multiple values
        return values.map((v) => this.decodeHtmlEntities(v)).join(', ');
      }
      return null;
    } catch {
      // If not valid JSON, return as-is after decoding
      return this.decodeHtmlEntities(infoField);
    }
  }

  /**
   * Decode common HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#160;/g, ' ')
      .replace(/&nbsp;/g, ' ');
  }

  /**
   * Parse MAM series_info field
   * Format: {"seriesId": ["Series Name", "bookNumber", orderIndex]}
   * Example: {"1812":["Harry Potter","1",1]}
   * Returns array of SeriesInfo objects
   */
  private parseMamSeriesField(
    seriesInfo: string | null | undefined,
  ): { name: string; number: string | null }[] | null {
    if (!seriesInfo || seriesInfo === '{}') {
      return null;
    }

    try {
      const parsed = JSON.parse(seriesInfo);
      if (typeof parsed === 'object' && parsed !== null) {
        const series: { name: string; number: string | null }[] = [];
        for (const value of Object.values(parsed)) {
          if (Array.isArray(value) && value.length >= 1) {
            const name = this.decodeHtmlEntities(String(value[0]));
            const number =
              value.length >= 2 && value[1] ? String(value[1]) : null;
            series.push({ name, number });
          }
        }
        return series.length > 0 ? series : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Clean description - decode HTML entities but preserve HTML tags for rendering
   * Also rewrites MAM gateway image URLs to direct URLs
   */
  private cleanDescription(
    description: string | null | undefined,
  ): string | null {
    if (!description) {
      return null;
    }

    let cleaned = this.decodeHtmlEntities(description);

    // Rewrite MAM gateway image URLs to direct URLs
    // Pattern: https://www.myanonamouse.net/imageBucket.php/[hash]/[filename]
    // These should be rewritten to remove the gateway
    cleaned = cleaned.replace(
      /https?:\/\/www\.myanonamouse\.net\/imageBucket\.php\/([a-f0-9]+)\/([^"'\s>]+)/gi,
      'https://www.myanonamouse.net/imageBucket.php/$1/$2',
    );

    return cleaned;
  }

  async search(
    query: string,
    perPage: number,
    offset: number,
    _userId: string,
    contentType: 'all' | 'audiobooks' | 'ebooks' = 'all',
    searchIn?: string[],
    languages?: number[],
  ): Promise<SearchMamResponseDto> {
    // Map contentType to main_cat
    let mainCat: number[];
    switch (contentType) {
      case 'audiobooks':
        mainCat = [13];
        break;
      case 'ebooks':
        mainCat = [14];
        break;
      default:
        mainCat = [13, 14];
    }

    const mamResponse = await this.mamClient.search({
      text: query,
      perpage: perPage,
      startNumber: offset,
      main_cat: mainCat,
      srchIn: searchIn?.length ? searchIn : undefined,
      browse_lang: languages?.length ? languages : undefined,
    });

    // Get MAM torrent IDs to check for existing requests (convert to strings for DB query)
    const mamIdStrings = mamResponse.data.map((t) => String(t.id));

    // Fetch existing requests for these torrents
    const existingRequests =
      mamIdStrings.length > 0
        ? await this.db
            .select({
              mamTorrentId: requestsSchema.requests.mamTorrentId,
              id: requestsSchema.requests.id,
              status: requestsSchema.requests.status,
            })
            .from(requestsSchema.requests)
            .where(
              and(
                inArray(requestsSchema.requests.mamTorrentId, mamIdStrings),
                or(
                  eq(requestsSchema.requests.status, 'pending'),
                  eq(requestsSchema.requests.status, 'approved'),
                  eq(requestsSchema.requests.status, 'downloading'),
                ),
              ),
            )
        : [];

    const requestMap = new Map(
      existingRequests.map((r) => [r.mamTorrentId, r]),
    );

    // Map results
    const results: MamSearchResultDto[] = mamResponse.data.map((torrent) => {
      const existing = requestMap.get(String(torrent.id));
      const contentType: ContentType =
        torrent.main_cat === 13 ? 'audiobook' : 'ebook';

      return {
        id: torrent.id,
        title: this.decodeHtmlEntities(torrent.title),
        author: this.parseMamInfoField(torrent.author_info),
        narrator: this.parseMamInfoField(torrent.narrator_info),
        series: this.parseMamSeriesField(torrent.series_info),
        description: this.cleanDescription(torrent.description),
        coverUrl: null, // MAM doesn't provide cover URLs in search
        contentType,
        category: torrent.catname || '',
        mamCategory: torrent.category,
        size: torrent.size,
        language: torrent.lang_code,
        fileType: torrent.filetype,
        tags: Array.isArray(torrent.tags) ? torrent.tags : [],
        addedDate: torrent.added,
        existingRequestId: existing?.id ?? null,
        existingRequestStatus: existing?.status ?? null,
        inLibrary: false, // TODO: Check if in library by title/author matching
        libraryItemId: null,
      };
    });

    return {
      results,
      total: mamResponse.total_found,
    };
  }

  async createRequest(
    dto: CreateRequestDto,
    userId: string,
  ): Promise<RequestResponseDto> {
    // Convert number to string for DB storage
    const mamTorrentIdStr = String(dto.mamTorrentId);

    // Check for existing active request
    const existing = await this.db
      .select()
      .from(requestsSchema.requests)
      .where(
        and(
          eq(requestsSchema.requests.mamTorrentId, mamTorrentIdStr),
          or(
            eq(requestsSchema.requests.status, 'pending'),
            eq(requestsSchema.requests.status, 'approved'),
            eq(requestsSchema.requests.status, 'downloading'),
          ),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const existingRequest = existing[0];

      // If user is already the requester, return error
      if (existingRequest.userId === userId) {
        throw new BadRequestException('You have already requested this item');
      }

      // Add as supporter
      await this.addSupporter(existingRequest.id, userId);
      return this.getRequestById(existingRequest.id, userId);
    }

    // Create new request
    const [request] = await this.db
      .insert(requestsSchema.requests)
      .values({
        userId,
        mamTorrentId: mamTorrentIdStr,
        title: dto.title,
        author: dto.author,
        narrator: dto.narrator,
        series: dto.series,
        description: dto.description,
        coverUrl: dto.coverUrl,
        contentType: dto.contentType,
        mamCategory: dto.mamCategory,
      })
      .returning();

    return this.getRequestById(request.id, userId);
  }

  async addSupporter(requestId: string, userId: string): Promise<void> {
    // Check if already a supporter
    const existing = await this.db
      .select()
      .from(requestsSchema.requestSupporters)
      .where(
        and(
          eq(requestsSchema.requestSupporters.requestId, requestId),
          eq(requestsSchema.requestSupporters.userId, userId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await this.db.insert(requestsSchema.requestSupporters).values({
        requestId,
        userId,
      });
    }
  }

  async getUserRequests(userId: string): Promise<RequestResponseDto[]> {
    const requests = await this.db
      .select()
      .from(requestsSchema.requests)
      .where(eq(requestsSchema.requests.userId, userId))
      .orderBy(requestsSchema.requests.createdAt);

    return Promise.all(requests.map((r) => this.mapToResponseDto(r, userId)));
  }

  async getAllRequests(status?: RequestStatus): Promise<RequestResponseDto[]> {
    const query = this.db.select().from(requestsSchema.requests);

    const requests = status
      ? await query.where(eq(requestsSchema.requests.status, status))
      : await query;

    return Promise.all(requests.map((r) => this.mapToResponseDto(r, null)));
  }

  async getRequestById(
    id: string,
    userId: string | null,
  ): Promise<RequestResponseDto> {
    const [request] = await this.db
      .select()
      .from(requestsSchema.requests)
      .where(eq(requestsSchema.requests.id, id))
      .limit(1);

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    return this.mapToResponseDto(request, userId);
  }

  async approveRequest(id: string): Promise<RequestResponseDto> {
    const request = await this.getRequestByIdInternal(id);

    if (request.status !== 'pending') {
      throw new BadRequestException('Can only approve pending requests');
    }

    // Determine qBittorrent category based on content type and MAM category
    // MAM category 61 = "Ebooks - Comics/Graphic novels"
    let category: string;
    if (request.mamCategory === 61) {
      category = 'comics';
    } else if (request.contentType === 'audiobook') {
      category = 'audiobooks';
    } else {
      category = 'books';
    }

    // Start download via MAM client
    const downloadResult = await this.mamClient.download(request.mamTorrentId, {
      category,
    });

    // Get torrent info to cache folder name
    const torrentStatus = await this.mamClient.getTorrentStatus(
      downloadResult.hash,
    );

    // Update request with hash and folder name
    await this.db
      .update(requestsSchema.requests)
      .set({
        status: 'approved',
        torrentHash: downloadResult.hash,
        folderName: torrentStatus.name,
      })
      .where(eq(requestsSchema.requests.id, id));

    return this.getRequestById(id, null);
  }

  async rejectRequest(
    id: string,
    dto: RejectRequestDto,
  ): Promise<RequestResponseDto> {
    const request = await this.getRequestByIdInternal(id);

    if (request.status !== 'pending') {
      throw new BadRequestException('Can only reject pending requests');
    }

    await this.db
      .update(requestsSchema.requests)
      .set({
        status: 'rejected',
        rejectionReason: dto.reason || null,
      })
      .where(eq(requestsSchema.requests.id, id));

    return this.getRequestById(id, null);
  }

  async updateDownloadingStatuses(): Promise<void> {
    // Get all requests that are approved or downloading
    const activeRequests = await this.db
      .select()
      .from(requestsSchema.requests)
      .where(
        and(
          or(
            eq(requestsSchema.requests.status, 'approved'),
            eq(requestsSchema.requests.status, 'downloading'),
          ),
          isNull(requestsSchema.requests.libraryItemId),
        ),
      );

    if (activeRequests.length === 0) return;

    const hashes = activeRequests
      .map((r) => r.torrentHash)
      .filter((h): h is string => h !== null);

    if (hashes.length === 0) return;

    try {
      const statuses = await this.mamClient.getBulkTorrentStatus(hashes);

      for (const torrentStatus of statuses.torrents) {
        const request = activeRequests.find(
          (r) => r.torrentHash === torrentStatus.hash,
        );
        if (!request) continue;

        let newStatus: RequestStatus | null = null;

        if (torrentStatus.state === 'downloading') {
          newStatus = 'downloading';
        } else if (
          torrentStatus.state === 'completed' ||
          torrentStatus.state === 'seeding'
        ) {
          // Keep as downloading until import matcher links it
          newStatus = 'downloading';
        } else if (torrentStatus.state === 'not_found') {
          this.logger.warn(
            `Torrent ${torrentStatus.hash} not found for request ${request.id}`,
          );
          continue;
        }

        if (newStatus && newStatus !== request.status) {
          await this.db
            .update(requestsSchema.requests)
            .set({ status: newStatus })
            .where(eq(requestsSchema.requests.id, request.id));
        }
      }
    } catch (error) {
      this.logger.error(`Failed to update downloading statuses: ${error}`);
    }
  }

  async tryMatchImport(
    folderName: string,
    libraryItemId: string,
    libraryItemType: ContentType,
  ): Promise<boolean> {
    // Find request with matching folder name that's downloading
    const [request] = await this.db
      .select()
      .from(requestsSchema.requests)
      .where(
        and(
          eq(requestsSchema.requests.folderName, folderName),
          eq(requestsSchema.requests.status, 'downloading'),
        ),
      )
      .limit(1);

    if (!request) {
      return false;
    }

    // Link the request to the library item
    await this.db
      .update(requestsSchema.requests)
      .set({
        status: 'complete',
        libraryItemId,
        libraryItemType,
      })
      .where(eq(requestsSchema.requests.id, request.id));

    this.logger.log(
      `Matched request ${request.id} to ${libraryItemType} ${libraryItemId}`,
    );
    return true;
  }

  private async getRequestByIdInternal(id: string) {
    const [request] = await this.db
      .select()
      .from(requestsSchema.requests)
      .where(eq(requestsSchema.requests.id, id))
      .limit(1);

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    return request;
  }

  private async mapToResponseDto(
    request: typeof requestsSchema.requests.$inferSelect,
    currentUserId: string | null,
  ): Promise<RequestResponseDto> {
    // Get user email
    const [user] = await this.db
      .select({ email: authSchema.user.email })
      .from(authSchema.user)
      .where(eq(authSchema.user.id, request.userId))
      .limit(1);

    // Get supporter count
    const supporters = await this.db
      .select({ userId: requestsSchema.requestSupporters.userId })
      .from(requestsSchema.requestSupporters)
      .where(eq(requestsSchema.requestSupporters.requestId, request.id));

    const isSupporter = currentUserId
      ? supporters.some((s) => s.userId === currentUserId)
      : false;

    return {
      id: request.id,
      userId: request.userId,
      userEmail: user?.email ?? 'Unknown',
      status: request.status,
      mamTorrentId: request.mamTorrentId,
      title: request.title,
      author: request.author,
      narrator: request.narrator,
      series: request.series,
      description: request.description,
      coverUrl: request.coverUrl,
      contentType: request.contentType,
      rejectionReason: request.rejectionReason,
      libraryItemId: request.libraryItemId,
      libraryItemType: request.libraryItemType,
      supporterCount: supporters.length,
      isSupporter,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }
}

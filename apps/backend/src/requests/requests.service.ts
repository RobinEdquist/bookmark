import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, or, inArray, isNull, gte, sql, desc } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { getLastMondayUTC } from '../common/utils/date.utils';
import * as requestsSchema from './schema';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as authSchema from '../auth/schema';
import { TrackerService } from '../tracker';
import { AppSettingsService } from '../app-settings/app-settings.service';
import {
  CreateRequestDto,
  RejectRequestDto,
  RequestResponseDto,
  TrackerSearchResultDto,
  TrackerSearchResultsDto,
} from './dto';
import { RequestStatus, ContentType } from './schema';

type CombinedSchema = typeof requestsSchema &
  typeof audiobooksSchema &
  typeof ebooksSchema &
  typeof authSchema;

// Tracker category id for comics/graphic novels. Requests in this category are
// routed to the dedicated comics download-client category on approval.
const COMICS_CATEGORY_ID = 61;

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<CombinedSchema>,
    private tracker: TrackerService,
    private appSettingsService: AppSettingsService,
  ) {}

  async search(
    query: string,
    perPage: number,
    offset: number,
    _userId: string,
    contentType: 'all' | 'audiobooks' | 'ebooks' = 'all',
    searchIn?: string[],
    languages?: number[],
  ): Promise<TrackerSearchResultsDto> {
    // Map contentType to tracker content-type ids
    let categories: string[];
    switch (contentType) {
      case 'audiobooks':
        categories = ['audiobook'];
        break;
      case 'ebooks':
        categories = ['ebook'];
        break;
      default:
        categories = ['audiobook', 'ebook'];
    }

    const response = await this.tracker.search({
      query,
      perPage,
      offset,
      categories,
      searchIn: searchIn?.length ? searchIn : undefined,
      languages: languages?.length ? languages : undefined,
    });

    const torrents = response.results ?? [];

    // Get torrent IDs to check for existing requests (convert to strings for DB query)
    const torrentIdStrings = torrents.map((t) => String(t.id));

    // Fetch existing requests for these torrents
    const existingRequests =
      torrentIdStrings.length > 0
        ? await this.db
            .select({
              torrentId: requestsSchema.requests.torrentId,
              id: requestsSchema.requests.id,
              status: requestsSchema.requests.status,
            })
            .from(requestsSchema.requests)
            .where(
              and(
                inArray(requestsSchema.requests.torrentId, torrentIdStrings),
                or(
                  eq(requestsSchema.requests.status, 'pending'),
                  eq(requestsSchema.requests.status, 'approved'),
                  eq(requestsSchema.requests.status, 'downloading'),
                ),
              ),
            )
        : [];

    const requestMap = new Map(existingRequests.map((r) => [r.torrentId, r]));

    // Map results (already parsed and cleaned by the tracker client)
    const results: TrackerSearchResultDto[] = torrents.map((torrent) => {
      const existing = requestMap.get(String(torrent.id));

      return {
        id: torrent.id,
        title: torrent.title,
        author: torrent.author ?? null,
        narrator: torrent.narrator ?? null,
        series:
          torrent.series?.map((s) => ({
            name: s.name,
            number: s.number ?? null,
          })) ?? null,
        description: torrent.description ?? null,
        coverUrl: `/api/requests/cover/${torrent.id}`,
        contentType: torrent.contentType,
        category: torrent.categoryName || '',
        categoryId: torrent.categoryId,
        size: torrent.size ?? '',
        language: torrent.language ?? '',
        fileType: torrent.fileType ?? '',
        tags: torrent.tags ?? [],
        addedDate: torrent.addedDate ?? '',
        existingRequestId: existing?.id ?? null,
        existingRequestStatus: existing?.status ?? null,
        inLibrary: false, // TODO: Check if in library by title/author matching
        libraryItemId: null,
      };
    });

    return {
      results,
      total: response.total ?? 0,
    };
  }

  async createRequest(
    dto: CreateRequestDto,
    userId: string,
  ): Promise<RequestResponseDto> {
    // Convert number to string for DB storage
    const torrentIdStr = String(dto.torrentId);

    // Check for existing active request
    const existing = await this.db
      .select()
      .from(requestsSchema.requests)
      .where(
        and(
          eq(requestsSchema.requests.torrentId, torrentIdStr),
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
        torrentId: torrentIdStr,
        title: dto.title,
        author: dto.author,
        narrator: dto.narrator,
        series: dto.series,
        description: dto.description,
        coverUrl: dto.coverUrl,
        contentType: dto.contentType,
        categoryId: dto.categoryId,
      })
      .returning();

    // Check if user has auto-approve budget
    const { used, limit } = await this.getUserAutoApproveUsage(userId);
    if (limit > 0 && used < limit) {
      try {
        await this.performApproval(request, userId);
        this.logger.log(
          `Auto-approved request ${request.id} for user ${userId} (${used + 1}/${limit})`,
        );
      } catch (error) {
        this.logger.error(
          `Auto-approve failed for request ${request.id}: ${error}`,
        );
        // Request stays as pending if auto-approve fails
      }
    }

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

    // Check if request is still pending and supporter has budget
    const [request] = await this.db
      .select()
      .from(requestsSchema.requests)
      .where(eq(requestsSchema.requests.id, requestId))
      .limit(1);

    if (request && request.status === 'pending') {
      const { used, limit } = await this.getUserAutoApproveUsage(userId);
      if (limit > 0 && used < limit) {
        try {
          await this.performApproval(request, userId);
          this.logger.log(
            `Auto-approved request ${requestId} via supporter ${userId} (${used + 1}/${limit})`,
          );
        } catch (error) {
          this.logger.error(
            `Auto-approve via supporter failed for request ${requestId}: ${error}`,
          );
          // Request stays as pending if auto-approve fails
        }
      }
    }
  }

  async getUserAutoApproveUsage(
    userId: string,
  ): Promise<{ used: number; limit: number }> {
    const settings = await this.appSettingsService.getSettings();
    const limit = settings?.autoApproveRequestsPerWeek ?? 0;

    if (limit === 0) {
      return { used: 0, limit: 0 };
    }

    const lastMonday = getLastMondayUTC();

    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(requestsSchema.requests)
      .where(
        and(
          eq(requestsSchema.requests.autoApprovedByUserId, userId),
          gte(requestsSchema.requests.createdAt, lastMonday),
        ),
      );

    return { used: result?.count ?? 0, limit };
  }

  async getUserRequests(userId: string): Promise<RequestResponseDto[]> {
    const requests = await this.db
      .select()
      .from(requestsSchema.requests)
      .where(eq(requestsSchema.requests.userId, userId))
      .orderBy(desc(requestsSchema.requests.createdAt));

    return Promise.all(requests.map((r) => this.mapToResponseDto(r, userId)));
  }

  async getAllRequests(status?: RequestStatus): Promise<RequestResponseDto[]> {
    const baseQuery = this.db
      .select()
      .from(requestsSchema.requests)
      .orderBy(desc(requestsSchema.requests.createdAt));

    const requests = status
      ? await baseQuery.where(eq(requestsSchema.requests.status, status))
      : await baseQuery;

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

    await this.performApproval(request, null);

    return this.getRequestById(id, null);
  }

  private async performApproval(
    request: typeof requestsSchema.requests.$inferSelect,
    autoApprovedByUserId: string | null,
  ): Promise<void> {
    // Get configurable category names from settings
    const categories = await this.appSettingsService.getRequestsCategories();

    // Determine download-client category based on content type and tracker category
    let category: string;
    if (request.categoryId === COMICS_CATEGORY_ID) {
      category = categories.comics;
    } else if (request.contentType === 'audiobook') {
      category = categories.audiobook;
    } else {
      category = categories.ebook;
    }

    // Check if freeleech wedges should be used
    const settings = await this.appSettingsService.getSettings();
    const usePersonalFL = settings.requestsUseFreeleech;

    // Start download via tracker client
    const downloadResult = await this.tracker.download(request.torrentId, {
      category,
      usePersonalFL: usePersonalFL || undefined,
    });

    // Get torrent info to cache folder name
    const torrentStatus = await this.tracker.getTorrentStatus(
      downloadResult.hash,
    );

    // Update request with hash, folder name, and auto-approval info
    await this.db
      .update(requestsSchema.requests)
      .set({
        status: 'approved',
        torrentHash: downloadResult.hash,
        folderName: torrentStatus.name,
        autoApprovedByUserId,
      })
      .where(eq(requestsSchema.requests.id, request.id));
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
      const statuses = await this.tracker.getBulkTorrentStatus(hashes);

      for (const torrentStatus of statuses.torrents) {
        const request = activeRequests.find(
          (r) => r.torrentHash === torrentStatus.hash,
        );
        if (!request) continue;

        let newStatus: RequestStatus | null = null;

        // The download client has many states (downloading, stalledDL, uploading, stalledUP, etc.)
        // We only care about 'not_found' - all other states mean the torrent exists
        // Transition to 'complete' happens via import matcher when file is imported
        const state = torrentStatus.state;

        if (state === 'not_found') {
          this.logger.warn(
            `Torrent ${torrentStatus.hash} not found for request ${request.id}`,
          );
          continue;
        }

        // Keep as 'downloading' until import matcher links it to library
        newStatus = 'downloading';

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
    // Find request with matching folder name that's approved or downloading
    // We need to match both statuses because small files may be imported
    // before updateDownloadingStatuses() runs to change status from 'approved' to 'downloading'
    const [request] = await this.db
      .select()
      .from(requestsSchema.requests)
      .where(
        and(
          eq(requestsSchema.requests.folderName, folderName),
          or(
            eq(requestsSchema.requests.status, 'approved'),
            eq(requestsSchema.requests.status, 'downloading'),
          ),
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

    // Get auto-approver email if applicable
    let autoApprovedByEmail: string | null = null;
    if (request.autoApprovedByUserId) {
      const [autoApprover] = await this.db
        .select({ email: authSchema.user.email })
        .from(authSchema.user)
        .where(eq(authSchema.user.id, request.autoApprovedByUserId))
        .limit(1);
      autoApprovedByEmail = autoApprover?.email ?? null;
    }

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
      torrentId: request.torrentId,
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
      autoApprovedByUserId: request.autoApprovedByUserId,
      autoApprovedByEmail,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }
}

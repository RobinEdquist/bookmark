import { RequestAttemptDto } from './dto/request-attempt.dto';
import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  eq,
  and,
  or,
  inArray,
  isNull,
  isNotNull,
  gte,
  sql,
  desc,
  type SQL,
  asc,
  lte,
} from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { getLastMondayUTC } from '../common/utils/date.utils';
import * as requestsSchema from './schema';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as authSchema from '../auth/schema';
import { TrackerService } from '../tracker';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { LibraryService } from '../library/library.service';
import {
  CreateRequestDto,
  RejectRequestDto,
  RequestResponseDto,
  TrackerSearchResultDto,
  TrackerSearchResultsDto,
  TrackerLanguagesResponseDto,
} from './dto';
import { RequestStatus, ContentType } from './schema';
import {
  bookKey,
  normalizeBookText,
  languageKey,
  nextSearchDate,
  selectCandidate,
  parseReleaseDate,
} from './request-intent';

type CombinedSchema = typeof requestsSchema &
  typeof audiobooksSchema &
  typeof ebooksSchema &
  typeof authSchema;

@Injectable()
export class RequestsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<CombinedSchema>,
    private tracker: TrackerService,
    private appSettingsService: AppSettingsService,
    private libraryService: LibraryService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.recoverStaleSubmissions();
  }

  /** A crashed submitter cannot establish whether the module accepted a job. */
  async recoverStaleSubmissions(): Promise<void> {
    // JSON calls time out after 30 seconds. Allow the full search lease before
    // retiring a submission so startup in another replica cannot interrupt it.
    const cutoff = new Date(Date.now() - 1_800_000);
    const recovered = await this.db
      .update(requestsSchema.requestAttempts)
      .set({
        status: 'uncertain',
        reason: 'Submission interrupted; outcome needs reconciliation',
      })
      .where(
        and(
          eq(requestsSchema.requestAttempts.status, 'submitting'),
          lte(requestsSchema.requestAttempts.updatedAt, cutoff),
        ),
      )
      .returning({ id: requestsSchema.requestAttempts.id });
    if (recovered.length)
      this.logger.warn(
        `Marked ${recovered.length} interrupted submissions uncertain; inspect request attempt history before reconciliation`,
      );
  }

  /**
   * A same-medium library item whose title matches exactly is a confirmed
   * match when authors agree: either the library item has no authors, or the
   * torrent/wanted author matches one of them. Missing torrent author against
   * a library item that has authors is only a possible match. A trigram hit
   * that is not an exact title match is only a suggestion: it must not hide
   * the request button or complete a request. An audiobook never confirms an
   * ebook request, and the reverse. Comics have no library search yet, so
   * they are left unmatched.
   */
  private async findLibraryMatch(
    title: string,
    author: string | null,
    contentType: ContentType,
  ): Promise<{
    confirmed: boolean;
    confidence: 'confirmed' | 'possible';
    libraryItemId: string;
  } | null> {
    if (contentType === 'comics' || !title.trim()) {
      return null;
    }

    const contentFilter = contentType === 'audiobook' ? 'audiobooks' : 'ebooks';
    let results: Awaited<ReturnType<LibraryService['searchLibrary']>>;
    try {
      results = await this.libraryService.searchLibrary(
        title,
        contentFilter,
        5,
      );
    } catch (error) {
      this.logger.debug(`Library match lookup failed: ${error}`);
      return null;
    }

    const items =
      contentType === 'audiobook' ? results.audiobooks : results.ebooks;
    const wantedTitle = title.trim().toLowerCase();
    const wantedAuthor = author?.trim().toLowerCase() || null;

    const exact = items.find((item) => {
      if (item.title.trim().toLowerCase() !== wantedTitle) return false;
      if (!wantedAuthor) {
        // Exact title alone is not enough when the library item has authors —
        // same title, different author must not confirm.
        return item.authors.length === 0;
      }
      return item.authors.some(
        (person) => person.name.trim().toLowerCase() === wantedAuthor,
      );
    });
    if (exact) {
      return {
        confirmed: true,
        confidence: 'confirmed',
        libraryItemId: exact.id,
      };
    }

    const possible = items[0];
    if (!possible) return null;
    return {
      confirmed: false,
      confidence: 'possible',
      libraryItemId: possible.id,
    };
  }

  async search(
    query: string,
    perPage: number,
    offset: number,
    userId: string,
    contentType: 'all' | 'audiobooks' | 'ebooks' | 'comics' = 'all',
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
      case 'comics':
        categories = ['comics'];
        break;
      default:
        categories = ['audiobook', 'ebook', 'comics'];
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
              userId: requestsSchema.requests.userId,
              bookKey: requestsSchema.requests.bookKey,
              contentType: requestsSchema.requests.contentType,
              languageKey: requestsSchema.requests.languageKey,
            })
            .from(requestsSchema.requests)
            .where(
              and(
                or(
                  inArray(requestsSchema.requests.torrentId, torrentIdStrings),
                  ...torrents.map((torrent) =>
                    and(
                      eq(
                        requestsSchema.requests.bookKey,
                        bookKey(torrent.title, torrent.author ?? null),
                      ),
                      eq(
                        requestsSchema.requests.contentType,
                        torrent.contentType,
                      ),
                      eq(
                        requestsSchema.requests.languageKey,
                        languageKey(torrent.language ? [torrent.language] : []),
                      ),
                    ),
                  ),
                ),
                or(
                  eq(requestsSchema.requests.status, 'pending'),
                  eq(requestsSchema.requests.status, 'approved'),
                  eq(requestsSchema.requests.status, 'waiting'),
                  eq(requestsSchema.requests.status, 'downloading'),
                ),
              ),
            )
        : [];

    // A torrent can carry more than one active request; the caller's own always
    // wins so the UI offers "Requested" rather than "Support your own request".
    const requestMap = new Map<string, (typeof existingRequests)[number]>();
    for (const existing of existingRequests) {
      const current = requestMap.get(existing.torrentId ?? '');
      if (
        !current ||
        (existing.userId === userId && current.userId !== userId)
      ) {
        requestMap.set(existing.torrentId ?? '', existing);
      }
    }

    const intentMap = new Map<string, (typeof existingRequests)[number]>();
    for (const existing of existingRequests) {
      const key = `${existing.bookKey}|${existing.contentType}|${existing.languageKey}`;
      const current = intentMap.get(key);
      if (!current || existing.userId === userId) intentMap.set(key, existing);
    }

    // Cache library lookups within this search so duplicate torrents do not
    // re-hit searchLibrary for the same title/author/medium.
    const libraryMatchCache = new Map<
      string,
      Awaited<ReturnType<RequestsService['findLibraryMatch']>>
    >();

    // Map results (already parsed and cleaned by the tracker client)
    const results: TrackerSearchResultDto[] = await Promise.all(
      torrents.map(async (torrent) => {
        const intentKey = `${bookKey(torrent.title, torrent.author ?? null)}|${torrent.contentType}|${languageKey(torrent.language ? [torrent.language] : [])}`;
        const releaseRequest = requestMap.get(String(torrent.id));
        const existing =
          intentMap.get(intentKey) ??
          (releaseRequest?.languageKey == null ||
          releaseRequest.languageKey ===
            languageKey(torrent.language ? [torrent.language] : [])
            ? releaseRequest
            : undefined);
        const cacheKey = `${torrent.contentType}|${torrent.title.trim().toLowerCase()}|${(torrent.author ?? '').trim().toLowerCase()}`;
        let libraryMatch = libraryMatchCache.get(cacheKey);
        if (libraryMatch === undefined) {
          libraryMatch = await this.findLibraryMatch(
            torrent.title,
            torrent.author ?? null,
            torrent.contentType,
          );
          libraryMatchCache.set(cacheKey, libraryMatch);
        }

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
          existingRequestIsMine: existing?.userId === userId,
          inLibrary: libraryMatch?.confirmed ?? false,
          libraryItemId: libraryMatch?.confirmed
            ? libraryMatch.libraryItemId
            : null,
          libraryMatch: libraryMatch?.confidence ?? null,
        };
      }),
    );

    return {
      results,
      total: response.total ?? 0,
    };
  }

  async getLanguages(): Promise<TrackerLanguagesResponseDto> {
    return this.tracker.getLanguages();
  }

  async createRequest(
    dto: CreateRequestDto,
    userId: string,
  ): Promise<RequestResponseDto> {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('A book title is required');
    const intent = await this.resolveLanguageIntent(dto);
    const identity = bookKey(title, dto.author ?? null);
    const result = await this.db.transaction(async (tx) => {
      // Serialize compatible creates, including requests from different users.
      // Existing duplicate rows are preserved by migration, so pick the caller's
      // own row first rather than consolidating history/supporters destructively.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${identity + dto.contentType + intent.languageKey}, 0))`,
      );
      const [existing] = await tx
        .select()
        .from(requestsSchema.requests)
        .where(
          and(
            eq(requestsSchema.requests.bookKey, identity),
            eq(requestsSchema.requests.contentType, dto.contentType),
            eq(requestsSchema.requests.languageKey, intent.languageKey),
            inArray(requestsSchema.requests.status, [
              'pending',
              'approved',
              'waiting',
              'downloading',
            ]),
          ),
        )
        .orderBy(
          sql`(${requestsSchema.requests.userId} = ${userId}) DESC`,
          asc(requestsSchema.requests.createdAt),
        )
        .limit(1);
      if (existing) return { request: existing, existing: true };
      const [request] = await tx
        .insert(requestsSchema.requests)
        .values({
          userId,
          bookKey: identity,
          ...intent,
          title,
          author: dto.author?.trim() || null,
          narrator: dto.narrator,
          series: dto.series,
          description: dto.description,
          coverUrl: dto.coverUrl,
          contentType: dto.contentType,
          torrentId: dto.torrentId == null ? null : String(dto.torrentId),
          categoryId: dto.categoryId ?? null,
          candidateModule:
            dto.torrentId == null ? null : this.tracker.getModuleId(),
          nextSearchAt: dto.torrentId == null ? new Date() : null,
        })
        .returning();
      return { request, existing: false };
    });
    const { request } = result;
    if (result.existing) {
      if (request.userId === userId) {
        throw new BadRequestException('You have already requested this book');
      }
      await this.addSupporter(request.id, userId);
      return this.getRequestById(request.id, userId);
    }

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
    const request = await this.getRequestByIdInternal(requestId);

    // The requester already backs their own request — supporting it would only
    // inflate the supporter count and spend their own auto-approve budget twice.
    if (request.userId === userId) {
      throw new BadRequestException('You cannot support your own request');
    }

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
      await this.db
        .insert(requestsSchema.requestSupporters)
        .values({
          requestId,
          userId,
        })
        .onConflictDoNothing();
    }

    // Check if request is still pending and supporter has budget
    if (request.status === 'pending') {
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
          gte(requestsSchema.requests.approvedAt, lastMonday),
        ),
      );

    return { used: result?.count ?? 0, limit };
  }

  async getUserRequests(userId: string): Promise<RequestResponseDto[]> {
    const requests = await this.db
      .select()
      .from(requestsSchema.requests)
      .where(
        or(
          eq(requestsSchema.requests.userId, userId),
          sql`EXISTS (SELECT 1 FROM request_supporters WHERE request_supporters.request_id = ${requestsSchema.requests.id} AND request_supporters.user_id = ${userId})`,
        ),
      )
      .orderBy(desc(requestsSchema.requests.createdAt));

    return Promise.all(requests.map((r) => this.mapToResponseDto(r, userId)));
  }

  async getAllRequests(
    status?: RequestStatus,
    missingTorrentOnly = false,
  ): Promise<RequestResponseDto[]> {
    const conditions: SQL[] = [];

    if (status) {
      conditions.push(eq(requestsSchema.requests.status, status));
    }

    if (missingTorrentOnly) {
      conditions.push(isNotNull(requestsSchema.requests.torrentMissingSince));
    }

    const requests = await this.db
      .select()
      .from(requestsSchema.requests)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(requestsSchema.requests.createdAt));

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

  /** Approval is spent once. The attempt commits before external submission. */
  private async performApproval(
    request: typeof requestsSchema.requests.$inferSelect,
    autoApprovedByUserId: string | null,
  ): Promise<void> {
    const categories = await this.appSettingsService.getRequestsCategories();
    const settings = await this.appSettingsService.getSettings();
    const moduleId = this.tracker.getModuleId();
    if (request.candidateModule && request.candidateModule !== moduleId) {
      throw new BadRequestException(
        'The selected source changed; recheck availability first',
      );
    }
    const now = new Date();
    const attempt = await this.db.transaction(async (tx) => {
      const conditions = [
        eq(requestsSchema.requests.id, request.id),
        eq(requestsSchema.requests.status, 'pending'),
      ];
      if (autoApprovedByUserId) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`request-budget:${autoApprovedByUserId}`}, 0))`,
        );
        const weeklyLimit = settings.autoApproveRequestsPerWeek ?? 0;
        conditions.push(
          sql`(SELECT count(*) FROM requests WHERE auto_approved_by_user_id = ${autoApprovedByUserId} AND approved_at >= ${getLastMondayUTC()}) < ${weeklyLimit}`,
        );
      }
      const [claimed] = await tx
        .update(requestsSchema.requests)
        .set({
          status: 'approved',
          approvedAt: now,
          autoApprovedByUserId,
        })
        .where(and(...conditions))
        .returning();
      if (!claimed)
        throw new BadRequestException(
          'Request is no longer pending or approval allowance is exhausted',
        );
      if (claimed.candidateModule && claimed.candidateModule !== moduleId)
        throw new BadRequestException(
          'The selected source changed; recheck availability first',
        );
      if (!claimed.torrentId) {
        await tx
          .update(requestsSchema.requests)
          .set({ status: 'waiting', nextSearchAt: claimed.nextSearchAt ?? now })
          .where(eq(requestsSchema.requests.id, request.id));
        return null;
      }
      await tx
        .update(requestsSchema.requests)
        .set({ nextSearchAt: null })
        .where(eq(requestsSchema.requests.id, request.id));
      const [created] = await tx
        .insert(requestsSchema.requestAttempts)
        .values({
          requestId: request.id,
          moduleId,
          torrentId: claimed.torrentId,
          categoryId: claimed.categoryId,
          status: 'submitting',
        })
        .returning();
      return created;
    });
    if (attempt)
      await this.submitAttempt(
        request,
        attempt,
        categories,
        settings.requestsUseFreeleech,
      );
  }

  private async submitAttempt(
    request: typeof requestsSchema.requests.$inferSelect,
    attempt: typeof requestsSchema.requestAttempts.$inferSelect,
    categories: { audiobook: string; ebook: string; comics: string },
    usePersonalFL: boolean,
  ): Promise<void> {
    let hash: string;
    try {
      const result = await this.tracker.download(attempt.torrentId, {
        category: categories[request.contentType],
        usePersonalFL: usePersonalFL || undefined,
        submissionKey: attempt.id,
      });
      if (!result.hash || !/^[a-zA-Z0-9_-]+$/.test(result.hash)) {
        throw new Error('Module returned an invalid download identity');
      }
      hash = result.hash;
      await this.db.transaction(async (tx) => {
        await tx
          .update(requestsSchema.requestAttempts)
          .set({ status: 'tracking', torrentHash: hash })
          .where(eq(requestsSchema.requestAttempts.id, attempt.id));
        await tx
          .update(requestsSchema.requests)
          .set({ torrentHash: hash })
          .where(eq(requestsSchema.requests.id, request.id));
      });
    } catch (error) {
      // A timeout or a crash does not establish that a transfer is absent.
      // Retain the attempt for reconciliation rather than submitting it again.
      await this.db
        .update(requestsSchema.requestAttempts)
        .set({
          status: 'uncertain',
          reason: 'Submission outcome needs reconciliation',
        })
        .where(eq(requestsSchema.requestAttempts.id, attempt.id));
      this.logger.error(
        `Submission uncertain for request ${request.id}: ${error}`,
      );
      throw error;
    }
    try {
      const status = await this.tracker.getTorrentStatus(hash);
      if (status.name)
        await this.db.transaction(async (tx) => {
          await tx
            .update(requestsSchema.requests)
            .set({ folderName: status.name })
            .where(eq(requestsSchema.requests.id, request.id));
          await tx
            .update(requestsSchema.requestAttempts)
            .set({ folderName: status.name })
            .where(eq(requestsSchema.requestAttempts.id, attempt.id));
        });
    } catch (error) {
      this.logger.debug(
        `Status enrichment deferred for request ${request.id}: ${error}`,
      );
    }
  }

  private async resolveLanguageIntent(dto: CreateRequestDto) {
    const moduleId = this.tracker.getModuleId();
    let languageIds = [...new Set(dto.languages ?? [])].sort((a, b) => a - b);
    let languageNames: string[] = [];
    if (languageIds.length) {
      // Validate against the actual source rather than saving browser-owned IDs.
      const taxonomy = await this.tracker.getLanguages();
      languageNames = languageIds.map((id) => {
        const entry = taxonomy.languages.find((language) => language.id === id);
        if (!entry)
          throw new BadRequestException(
            'Selected language is unavailable from the current source',
          );
        return entry.name;
      });
    }
    if (dto.language?.trim()) {
      const name = dto.language.trim();
      if (
        languageNames.length &&
        !languageNames.some(
          (value) => normalizeBookText(value) === normalizeBookText(name),
        )
      ) {
        throw new BadRequestException(
          'Release language does not match the requested languages',
        );
      }
      // Keep the narrower known release language, retaining only selected IDs.
      if (languageIds.length) {
        const matching = languageIds
          .map((id, index) => ({ id, name: languageNames[index] }))
          .filter(
            (entry) =>
              normalizeBookText(entry.name) === normalizeBookText(name),
          );
        languageIds = matching.map((entry) => entry.id);
        languageNames = matching.map((entry) => entry.name);
      } else {
        languageNames = [name];
      }
    }
    return {
      languageIds,
      languageNames,
      languageModule: languageIds.length ? moduleId : null,
      languageKey: languageKey(languageNames),
    };
  }

  async getAttempts(id: string): Promise<RequestAttemptDto[]> {
    await this.getRequestByIdInternal(id);
    const attempts = await this.db
      .select()
      .from(requestsSchema.requestAttempts)
      .where(eq(requestsSchema.requestAttempts.requestId, id))
      .orderBy(asc(requestsSchema.requestAttempts.createdAt));
    return attempts.map((attempt) => ({
      id: attempt.id,
      moduleId: attempt.moduleId,
      torrentId: attempt.torrentId,
      status: attempt.status,
      torrentHash: attempt.torrentHash,
      reason: attempt.reason,
      createdAt: attempt.createdAt.toISOString(),
    }));
  }

  /** Queue through the shared schedule; an admin click cannot bypass rate limits. */
  async recheckRequest(id: string): Promise<RequestResponseDto> {
    const now = new Date();
    const [queued] = await this.db
      .update(requestsSchema.requests)
      .set({
        nextSearchAt: now,
        searchError: null,
        torrentId: null,
        categoryId: null,
        candidateModule: null,
      })
      .where(
        and(
          eq(requestsSchema.requests.id, id),
          inArray(requestsSchema.requests.status, ['pending', 'waiting']),
          or(
            isNull(requestsSchema.requests.torrentId),
            and(
              eq(requestsSchema.requests.status, 'pending'),
              sql`${requestsSchema.requests.candidateModule} <> ${this.tracker.getModuleId()}`,
            ),
          ),
          or(
            isNull(requestsSchema.requests.searchLeaseUntil),
            lte(requestsSchema.requests.searchLeaseUntil, now),
          ),
          or(
            isNull(requestsSchema.requests.releaseDate),
            lte(requestsSchema.requests.releaseDate, now),
          ),
        ),
      )
      .returning({ id: requestsSchema.requests.id });
    if (!queued)
      throw new BadRequestException(
        'This request is not eligible for an availability check',
      );
    return this.getRequestById(id, null);
  }

  async searchWaitingRequests(): Promise<void> {
    if (!this.tracker.isConfigured()) return;
    const settings = await this.appSettingsService.getSettings();
    if (!settings.requestsEnabled) return;
    const now = new Date();
    const schedulerLease = new Date(now.getTime() + 1_800_000);
    const claimed = await this.db.transaction(async (tx) => {
      const [slot] = await tx
        .update(requestsSchema.requestSearchSchedule)
        .set({ nextRunAt: schedulerLease })
        .where(
          and(
            eq(requestsSchema.requestSearchSchedule.id, 'availability'),
            lte(requestsSchema.requestSearchSchedule.nextRunAt, now),
          ),
        )
        .returning();
      if (!slot) return null;
      const rows = await tx
        .select()
        .from(requestsSchema.requests)
        .where(
          and(
            inArray(requestsSchema.requests.status, ['pending', 'waiting']),
            isNull(requestsSchema.requests.torrentId),
            lte(requestsSchema.requests.nextSearchAt, now),
            or(
              isNull(requestsSchema.requests.searchLeaseUntil),
              lte(requestsSchema.requests.searchLeaseUntil, now),
            ),
          ),
        )
        .orderBy(
          sql`${requestsSchema.requests.lastSearchAt} ASC NULLS FIRST`,
          asc(requestsSchema.requests.createdAt),
          asc(requestsSchema.requests.id),
        )
        .limit(10)
        .for('update', { skipLocked: true });
      const jobs: (typeof requestsSchema.requests.$inferSelect)[] = [];
      for (const row of rows) {
        const token = randomUUID();
        await tx
          .update(requestsSchema.requests)
          .set({ searchClaim: token, searchLeaseUntil: schedulerLease })
          .where(eq(requestsSchema.requests.id, row.id));
        jobs.push({ ...row, searchClaim: token });
      }
      return jobs;
    });
    if (!claimed) return;
    try {
      // One shared leased batch at a time. The cooldown starts after the last
      // operation, so slow modules cannot bunch overlapping batches together.
      const taxonomy = claimed.some((request) => request.languageIds.length)
        ? this.tracker.getLanguages()
        : null;
      const observedTaxonomy = taxonomy?.then(
        (value) => ({ value, error: null }),
        (error: unknown) => ({ value: null, error }),
      );
      for (const request of claimed)
        await this.searchWaitingRequest(request, observedTaxonomy);
    } finally {
      await this.db
        .update(requestsSchema.requestSearchSchedule)
        .set({ nextRunAt: new Date(Date.now() + 60_000) })
        .where(
          and(
            eq(requestsSchema.requestSearchSchedule.id, 'availability'),
            eq(requestsSchema.requestSearchSchedule.nextRunAt, schedulerLease),
          ),
        );
    }
  }

  private async searchWaitingRequest(
    request: typeof requestsSchema.requests.$inferSelect,
    taxonomyResult?: Promise<{
      value: { languages: { id: number; name: string }[] } | null;
      error: unknown;
    }> | null,
  ): Promise<void> {
    const moduleId = this.tracker.getModuleId();
    const now = new Date();
    try {
      if (request.languageModule && request.languageModule !== moduleId) {
        throw new Error('Language mapping belongs to a different source');
      }
      if (request.languageIds.length) {
        const result = await taxonomyResult;
        if (!result?.value)
          throw result?.error ?? new Error('Language taxonomy is unavailable');
        const taxonomy = result.value;
        if (
          request.languageIds.some(
            (id, i) =>
              !taxonomy.languages.some(
                (entry) =>
                  entry.id === id &&
                  normalizeBookText(entry.name) ===
                    normalizeBookText(request.languageNames[i]),
              ),
          )
        ) {
          throw new Error('Source language mapping changed');
        }
      }
      const response = await this.tracker.search({
        query: request.title,
        categories: [request.contentType],
        searchIn: ['title'],
        languages: request.languageIds.length ? request.languageIds : undefined,
        perPage: 25,
        offset: 0,
        book: {
          title: request.title,
          author: request.author,
          contentType: request.contentType,
          languageNames: request.languageNames,
        },
      });
      const candidate = selectCandidate(request, response.results ?? []);
      const validDate = parseReleaseDate(response.releaseDate);
      const attempt = await this.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(requestsSchema.requests)
          .where(
            and(
              eq(requestsSchema.requests.id, request.id),
              eq(requestsSchema.requests.searchClaim, request.searchClaim!),
              inArray(requestsSchema.requests.status, ['pending', 'waiting']),
              isNull(requestsSchema.requests.torrentId),
            ),
          )
          .for('update');
        if (!current) return null;
        await tx
          .update(requestsSchema.requests)
          .set({
            lastSearchAt: now,
            nextSearchAt: candidate ? null : nextSearchDate(now, 0, validDate),
            releaseDate: validDate,
            searchFailures: 0,
            searchError:
              response.releaseDate != null && !validDate
                ? 'Source returned an invalid publication date; regular checks continue'
                : null,
            searchClaim: null,
            searchLeaseUntil: null,
            ...(candidate
              ? {
                  torrentId: String(candidate.id),
                  categoryId: candidate.categoryId,
                  candidateModule: moduleId,
                }
              : {}),
          })
          .where(eq(requestsSchema.requests.id, request.id));
        // Discovery can attach a candidate to pending requests, never approve it.
        if (!candidate || current.status !== 'waiting' || !current.approvedAt)
          return null;
        const [created] = await tx
          .insert(requestsSchema.requestAttempts)
          .values({
            requestId: current.id,
            moduleId,
            torrentId: String(candidate.id),
            categoryId: candidate.categoryId,
            status: 'submitting',
          })
          .returning();
        await tx
          .update(requestsSchema.requests)
          .set({ status: 'approved' })
          .where(eq(requestsSchema.requests.id, current.id));
        return created;
      });
      if (attempt) {
        const categories =
          await this.appSettingsService.getRequestsCategories();
        const settings = await this.appSettingsService.getSettings();
        await this.submitAttempt(
          request,
          attempt,
          categories,
          settings.requestsUseFreeleech,
        );
      }
    } catch (error) {
      const failures = request.searchFailures + 1;
      // Do not expose module errors or credentials through user-facing responses.
      this.logger.debug(
        `Availability check failed for request ${request.id}: ${error}`,
      );
      await this.db
        .update(requestsSchema.requests)
        .set({
          lastSearchAt: now,
          nextSearchAt: nextSearchDate(now, failures, request.releaseDate),
          searchFailures: failures,
          searchError: 'Availability check failed; Bookmark will retry',
          searchClaim: null,
          searchLeaseUntil: null,
        })
        .where(
          and(
            eq(requestsSchema.requests.id, request.id),
            eq(requestsSchema.requests.searchClaim, request.searchClaim!),
          ),
        );
    }
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
        nextSearchAt: null,
        searchError: null,
        searchClaim: null,
        searchLeaseUntil: null,
      })
      .where(
        and(
          eq(requestsSchema.requests.id, id),
          eq(requestsSchema.requests.status, 'pending'),
        ),
      );

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

    const moduleId = this.tracker.getModuleId();
    const monitoredRequests = activeRequests.filter(
      (request) =>
        !request.candidateModule || request.candidateModule === moduleId,
    );
    const hashes = monitoredRequests
      .map((r) => r.torrentHash)
      .filter((h): h is string => h !== null);

    if (hashes.length === 0) return;

    try {
      const statuses = await this.tracker.getBulkTorrentStatus(hashes);
      const byHash = new Map(
        statuses.torrents.map((t) => [t.hash.toLowerCase(), t]),
      );

      for (const request of monitoredRequests) {
        if (!request.torrentHash) continue;

        const torrentStatus = byHash.get(request.torrentHash.toLowerCase());

        if (torrentStatus?.acquisitionFailed === true) {
          await this.db.transaction(async (tx) => {
            const [current] = await tx
              .select()
              .from(requestsSchema.requests)
              .where(
                and(
                  eq(requestsSchema.requests.id, request.id),
                  eq(requestsSchema.requests.torrentHash, request.torrentHash!),
                  isNull(requestsSchema.requests.libraryItemId),
                  inArray(requestsSchema.requests.status, [
                    'approved',
                    'downloading',
                  ]),
                ),
              )
              .for('update');
            if (!current) return;
            const [failed] = await tx
              .update(requestsSchema.requestAttempts)
              .set({
                status: 'failed',
                reason: 'Source confirmed a terminal acquisition failure',
              })
              .where(
                and(
                  eq(requestsSchema.requestAttempts.requestId, request.id),
                  eq(
                    requestsSchema.requestAttempts.torrentHash,
                    request.torrentHash!,
                  ),
                  eq(requestsSchema.requestAttempts.status, 'tracking'),
                ),
              )
              .returning();
            if (!failed) return;
            await tx
              .update(requestsSchema.requests)
              .set({
                status: 'waiting',
                torrentId: null,
                categoryId: null,
                candidateModule: null,
                torrentHash: null,
                folderName: null,
                torrentMissingSince: null,
                nextSearchAt: new Date(),
                searchClaim: null,
                searchLeaseUntil: null,
              })
              .where(
                and(
                  eq(requestsSchema.requests.id, request.id),
                  eq(requestsSchema.requests.torrentHash, request.torrentHash!),
                ),
              );
          });
          continue;
        }

        // A hash the client reports as 'not_found' — or doesn't report at all —
        // no longer exists there, so the request can never progress on its own.
        if (!torrentStatus || torrentStatus.state === 'not_found') {
          await this.flagTorrentMissing(request);
          continue;
        }

        // The download client has many states (downloading, stalledDL, uploading, stalledUP, etc.)
        // All of them mean the torrent exists; transition to 'complete' happens
        // via the import matcher when the file is imported, so keep the request
        // as 'downloading' until then.
        const updates: Partial<typeof requestsSchema.requests.$inferInsert> =
          {};

        if (request.status !== 'downloading') {
          updates.status = 'downloading';
        }

        // The torrent is back (re-added, or the client had just restarted).
        if (request.torrentMissingSince) {
          updates.torrentMissingSince = null;
          this.logger.log(
            `Torrent ${request.torrentHash} reappeared for request ${request.id}`,
          );
        }

        // A status lookup that failed during approval leaves folderName empty.
        // Import matching needs it, and this poll is the later read that has it.
        if (!request.folderName && torrentStatus.name) {
          updates.folderName = torrentStatus.name;
        }

        if (!request.folderName && torrentStatus.name) {
          await this.db
            .update(requestsSchema.requestAttempts)
            .set({ folderName: torrentStatus.name })
            .where(
              and(
                eq(requestsSchema.requestAttempts.requestId, request.id),
                eq(
                  requestsSchema.requestAttempts.torrentHash,
                  request.torrentHash,
                ),
              ),
            );
        }
        if (Object.keys(updates).length > 0) {
          await this.db
            .update(requestsSchema.requests)
            .set(updates)
            .where(
              and(
                eq(requestsSchema.requests.id, request.id),
                eq(requestsSchema.requests.torrentHash, request.torrentHash),
                isNull(requestsSchema.requests.libraryItemId),
                inArray(requestsSchema.requests.status, [
                  'approved',
                  'downloading',
                ]),
              ),
            );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to update downloading statuses: ${error}`);
    }
  }

  /**
   * Records that a request's torrent is gone from the download client. Logged at
   * warn level once, on the poll that first notices — the flag then keeps the
   * following 30-second polls quiet while the request waits for an admin.
   */
  private async flagTorrentMissing(
    request: typeof requestsSchema.requests.$inferSelect,
  ): Promise<void> {
    if (request.torrentMissingSince) {
      this.logger.debug(
        `Torrent ${request.torrentHash} still missing for request ${request.id} (since ${request.torrentMissingSince.toISOString()})`,
      );
      return;
    }

    await this.db
      .update(requestsSchema.requests)
      .set({ torrentMissingSince: new Date() })
      .where(
        and(
          eq(requestsSchema.requests.id, request.id),
          eq(requestsSchema.requests.torrentHash, request.torrentHash!),
          isNull(requestsSchema.requests.libraryItemId),
          inArray(requestsSchema.requests.status, ['approved', 'downloading']),
        ),
      );

    this.logger.warn(
      `Torrent ${request.torrentHash} not found for request ${request.id} ("${request.title}") - flagged for admin review`,
    );
  }

  async deleteRequest(id: string): Promise<void> {
    const request = await this.getRequestByIdInternal(id);

    // Supporter rows cascade. The torrent, if it still exists in the download
    // client, is left alone — deleting here only drops Bookmark's record.
    await this.db
      .delete(requestsSchema.requests)
      .where(eq(requestsSchema.requests.id, id));

    this.logger.log(`Deleted request ${id} ("${request.title}")`);
  }

  async tryMatchImport(
    folderName: string,
    libraryItemId: string,
    libraryItemType: ContentType,
  ): Promise<boolean> {
    // Find request with matching folder name that's approved or downloading
    // We need to match both statuses because small files may be imported
    // before updateDownloadingStatuses() runs to change status from 'approved' to 'downloading'
    const candidates = await this.db
      .select()
      .from(requestsSchema.requests)
      .where(
        and(
          eq(requestsSchema.requests.folderName, folderName),
          eq(requestsSchema.requests.contentType, libraryItemType),
          or(
            eq(requestsSchema.requests.status, 'approved'),
            eq(requestsSchema.requests.status, 'downloading'),
          ),
        ),
      );

    // An exact folder name shared by two active requests is not identity.
    // Leave both waiting rather than completing the wrong one.
    if (candidates.length !== 1) {
      if (candidates.length > 1) {
        this.logger.warn(
          `Import "${folderName}" matches ${candidates.length} ${libraryItemType} requests; not completing any`,
        );
      }
      return false;
    }

    const request = candidates[0];

    const completed = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(requestsSchema.requests)
        .set({
          status: 'complete',
          libraryItemId,
          libraryItemType,
        })
        .where(
          and(
            eq(requestsSchema.requests.id, request.id),
            eq(requestsSchema.requests.folderName, folderName),
            request.torrentHash
              ? eq(requestsSchema.requests.torrentHash, request.torrentHash)
              : isNull(requestsSchema.requests.torrentHash),
            inArray(requestsSchema.requests.status, [
              'approved',
              'downloading',
            ]),
            isNull(requestsSchema.requests.libraryItemId),
          ),
        )
        .returning({ id: requestsSchema.requests.id });
      if (!row) return false;
      await tx
        .update(requestsSchema.requestAttempts)
        .set({ status: 'complete' })
        .where(
          and(
            eq(requestsSchema.requestAttempts.requestId, request.id),
            request.torrentHash
              ? eq(
                  requestsSchema.requestAttempts.torrentHash,
                  request.torrentHash,
                )
              : isNull(requestsSchema.requestAttempts.torrentHash),
            inArray(requestsSchema.requestAttempts.status, [
              'tracking',
              'uncertain',
              'submitting',
            ]),
          ),
        );
      return true;
    });
    if (!completed) return false;

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
      bookKey: request.bookKey,
      languageNames: [...new Set(request.languageNames ?? [])],
      approvedAt: request.approvedAt?.toISOString() ?? null,
      lastSearchAt: request.lastSearchAt?.toISOString() ?? null,
      nextSearchAt: request.nextSearchAt?.toISOString() ?? null,
      releaseDate: request.releaseDate?.toISOString() ?? null,
      searchError: request.searchError ?? null,
      title: request.title,
      author: request.author,
      narrator: request.narrator,
      series: request.series,
      description: request.description,
      coverUrl: request.coverUrl,
      contentType: request.contentType,
      rejectionReason: request.rejectionReason,
      torrentMissingSince: request.torrentMissingSince?.toISOString() ?? null,
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

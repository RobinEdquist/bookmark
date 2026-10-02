# Building a Content Request Module

Bookmark's content request system lets users search an external catalog, request titles, and have approved requests downloaded and imported into the library automatically. The piece that talks to the outside world is **not** built into Bookmark — it is a separate HTTP service you run yourself, called a **content request module** (configured via the `TRACKER_CLIENT_*` environment variables).

Bookmark ships no module. You (or the community) implement one against the contract in this document, and Bookmark will happily talk to it. A module can be backed by anything — a private tracker, a Usenet indexer, a purchase pipeline, a shared drive — as long as it speaks this API.

```
┌──────────┐   session/API key   ┌──────────┐   X-API-Key    ┌───────────────┐
│ Browser  │────────────────────▶│ Bookmark │───────────────▶│  Your module  │
│          │  /api/requests/...  │ backend  │  /search, ...  │ (HTTP server) │
└──────────┘                     └──────────┘                └───────┬───────┘
                                      ▲                              │ downloads into
                                      │ library watcher imports      ▼
                                      └──────────────── shared import directory
```

Your module has two jobs:

1. **Answer Bookmark's HTTP calls** — search the catalog, start downloads, report download status, serve cover images.
2. **Deliver files** — completed downloads must land in a directory Bookmark's library watcher scans, under the exact folder name your module reports (see [Import matching](#the-import-matching-invariant)).

Book requests can also be saved before a downloadable release exists. They keep their book identity (normalized title and author), desired medium, language intent, supporters, and one approval across subsequent search checks and download attempts. Existing direct search-result requests remain supported.

The machine-readable version of this contract is the OpenAPI spec at
[`docs/api/content-request-module.openapi.yaml`](./api/content-request-module.openapi.yaml).
See [Verifying your implementation](#verifying-your-implementation) for how to test against it.

## Bookmark API for request clients

The module contract above describes the service Bookmark calls. The user and admin API is documented separately in Bookmark's generated OpenAPI document at `/api/docs-json` (Swagger UI: `/api/docs`). Export it with `pnpm --filter backend openapi:export /path/to/openapi.json`. These HTTP documentation endpoints are disabled in production unless `SWAGGER_ENABLED=true`; the export command remains available.

`POST /api/requests` accepts a book without a release:

```json
{
  "title": "The Hobbit",
  "author": "J.R.R. Tolkien",
  "contentType": "audiobook"
}
```

For a selected search result, also send its integer `torrentId` and `categoryId`. `categoryId` is required when `torrentId` is non-null. Optional `languages` contains up to 20 integer IDs from `GET /api/requests/languages`; omitted or empty means any language. A selected result's optional `language` must agree with these languages. The generated schema includes both creation forms, validation constraints, and examples.

Creation returns HTTP 201 with the request. When another user's compatible active request exists, Bookmark adds support and returns that existing request with the same status code. An existing request owned by the caller returns 400. Compatibility uses normalized title/author, medium, and accepted languages. `GET /api/requests` returns an array of requests the caller created or supports, each once.

An approved book without a selected release has status `waiting`. `approvedAt` remains the original approval time across attempts. `lastSearchAt`, `nextSearchAt`, and `releaseDate` are nullable UTC timestamps; `nextSearchAt` is the earliest check time, subject to the shared scheduler. Pending books may acquire a release through search but still require approval before submission.

Admins can inspect `GET /api/admin/requests/{id}/attempts`, which returns an array in creation order, oldest first (404 for a missing request). `POST /api/admin/requests/{id}/recheck` returns HTTP 200 after queuing an eligible pending or waiting request. It clears a stale source selection, retains approval gates, and cannot bypass a future publication date, active download, live search lease, or shared rate limits. Missing and ineligible requests return 400. Both endpoints require an authenticated admin. Existing approval, rejection, support, and search POST endpoints return HTTP 201.

---

## How Bookmark calls your module

- **Base URL** — Bookmark reads `TRACKER_CLIENT_URL` (e.g. `http://module:8000`) and appends paths directly. No trailing slash.
- **Authentication** — every request except `GET /health` carries the header `X-API-Key: <TRACKER_CLIENT_API_KEY>`. Your module must reject requests with a missing or wrong key (401/403). `GET /health` is probed **without** the key, so it must be unauthenticated.
- **Content type** — Bookmark sends `Content-Type: application/json` and expects JSON back on every endpoint except `/health` (body ignored) and `/image/{id}` (binary image).
- **Errors** — any non-2xx response is treated as a failure: Bookmark logs your response body and surfaces the HTTP status to the user. If your module is unreachable, Bookmark reports 503 "Tracker client unavailable". Waiting-book searches retry on a bounded durable schedule. Download submission never retries blindly after an uncertain outcome.
- **Timeouts** — JSON operations use a 30-second timeout. Keep search responses in the low seconds; kick off downloads asynchronously and return immediately.

Source of truth in the Bookmark codebase: `apps/backend/src/tracker/tracker.service.ts` (the client) and `apps/backend/src/tracker/types.ts` (the wire types).

---

## Required endpoints

| Method | Path                    | Auth | Purpose                                    |
| ------ | ----------------------- | ---- | ------------------------------------------ |
| GET    | `/health`               | none | Liveness probe                             |
| GET    | `/languages`            | key  | Language taxonomy for the search filter    |
| POST   | `/search`               | key  | Search the catalog                         |
| POST   | `/download/{torrentId}` | key  | Start downloading a search result          |
| GET    | `/torrent/{hash}`       | key  | Status of a single download                |
| GET    | `/torrents?hashes=…`    | key  | Bulk status of downloads (comma-separated) |
| GET    | `/image/{torrentId}`    | key  | Cover/thumbnail image for a search result  |

### `GET /health`

Return any 2xx when the module is up. The body is ignored. Must not require the API key.

### `GET /languages`

Returns the module's language taxonomy, used to populate Bookmark's language filter:

```json
{
  "languages": [
    { "id": 1, "name": "English" },
    { "id": 40, "name": "Swedish" }
  ]
}
```

The `id` values are **your own** — Bookmark never interprets them, it only passes the user's selection back in the `languages` field of `POST /search`. Return an empty list if your catalog has no language concept; Bookmark then hides the filter (the endpoint is required).

### Required book request contract

Modules implement OpenAPI contract version 2.0 together with Bookmark. There is no capability negotiation or older module protocol. All listed endpoints, including `/languages`, are required; a catalog without languages returns `{ "languages": [] }`.

Scheduled `/search` calls include `book: { title, author, contentType, languageNames }`. These fields scope observations to the requested book, medium, and language intent. Interactive searches omit `book`. Every response includes `releaseDate`, an ISO publication timestamp for that exact intent or null when unknown. A torrent's upload date is not a publication date. Search results use the same language names returned by `/languages` so accepted languages can match reliably.

Every `/download/{id}` includes `submissionKey`, the durable attempt UUID. Persist the key, item, options, and result across restarts. Repeated calls return the same transfer identity without starting another transfer or spending another freeleech credit. Conflicting inputs or an unresolved submission return 409 without submitting again. Unsupported optional controls such as personal freeleech spending return 422. Bookmark records uncertain outcomes and does not automatically replay a submission.

At startup and every thirty seconds, Bookmark marks `submitting` attempts with no update for thirty minutes as `uncertain`. This covers a process stopping after the durable attempt is committed, including while the module may already have accepted the transfer. Recent submissions remain untouched so another replica can finish them. Interrupted attempts appear in admin attempt history for reconciliation; the request's approval and supporters are preserved, and no replacement is submitted until the outcome is established.

### Durable availability checks

Approved requests without a release are **waiting for availability**; unapproved requests remain **pending**. Discovery may attach a candidate to either, but only an already approved waiting request can start downloading. Approval is charged once at the time it is granted, including when availability is unknown. Replacements do not charge it again.

Rejecting a pending request cancels its scheduled check, clears the last search error, and revokes any live search claim. A search finishing afterward cannot attach a release or schedule another check. Rejected requests no longer display waiting or retry copy.

Checks run in batches of at most ten searches per minute across server replicas, ordered by never-searched then least-recently-searched request. Only one batch runs at a time, followed by a one-minute cooldown. A persisted thirty-minute lease and token fence concurrent workers and recover after restarts. Language taxonomy is read once per batch when required. Ordinary misses recheck daily; infrastructure failures back off up to seven days. Future publication dates defer checks until the date, with at most weekly metadata revalidation to handle changed dates. Invalid and unknown dates retain regular checks. Administrators can queue eligible checks through `POST /api/admin/requests/{id}/recheck`, using the same schedule and limits.

Language IDs are stored with the configured source's identity and the names returned by its taxonomy. Checks validate that mapping and pause acquisition if the module or taxonomy changes. A known result language also becomes part of direct-request intent. Unknown result languages cannot fulfill a language-specific request. Candidate selection requires exact normalized title, author when known, medium, and accepted language. Unknown-author requests wait when exact-title results identify multiple different authors. Legacy modules use ordinary `/search`, with the same local candidate validation, and never supply trusted publication dates.

Book identity is intentionally lightweight. It does not yet model works and editions or unify different title/author spellings from external catalogs. Different medium and language requirements remain separate requests; compatible requests share supporters even if their release IDs differ. Existing duplicate rows are preserved during migration.

### `POST /search`

Request body Bookmark sends:

```json
{
  "query": "project hail mary",
  "categories": ["audiobook", "ebook", "comics"],
  "searchIn": ["title", "author"],
  "languages": [1],
  "perPage": 25,
  "offset": 0
}
```

- `query` and `categories` are always present. `categories` values are `"audiobook"`, `"ebook"` and/or `"comics"` — filter results to those content types. A module whose catalog has no comics simply returns no results for a comics-only search.
- `searchIn` (optional) restricts which fields to match: `title`, `author`, `narrator`, `series`, `tags`, `description`. When absent, search everything.
- `languages` (optional) is a list of language IDs from **your** `GET /languages` taxonomy — Bookmark passes the user's selection through opaquely.
- `perPage` (currently one of 10/25/50/100, don't rely on that) and `offset` implement pagination. When absent, pick sensible defaults.

Response:

```json
{
  "results": [
    {
      "id": 123456,
      "title": "Project Hail Mary",
      "author": "Andy Weir",
      "narrator": "Ray Porter",
      "series": [{ "name": "Standalone", "number": null }],
      "description": "…",
      "contentType": "audiobook",
      "categoryId": 42,
      "categoryName": "Audiobooks - Sci-Fi",
      "size": "1.2 GiB",
      "language": "English",
      "fileType": "M4B",
      "tags": ["science fiction"],
      "addedDate": "2026-01-15T10:30:00Z"
    }
  ],
  "total": 87
}
```

- `id`, `title`, `contentType`, `categoryId` are required; everything else may be `null` or omitted.
- `id` must be a **stable integer** that uniquely identifies the item in your catalog — Bookmark stores it and later calls `POST /download/{id}` and `GET /image/{id}` with it.
- `contentType` is one of `"audiobook"`, `"ebook"`, `"comics"`. This is the semantic field Bookmark routes on — the module owns the mapping from its upstream taxonomy to these values (e.g. if comics live under an ebook category upstream, report them as `"comics"` anyway).
- Return results **pre-parsed and clean**: resolve upstream formatting quirks (author/narrator split, series extraction, HTML stripping) inside the module. Bookmark displays these fields as-is.
- `total` is the total match count across all pages, for pagination UI.
- `categoryId` and `categoryName` are informational only — Bookmark stores and displays them but never interprets them.

### `POST /download/{torrentId}`

Called when an admin approves a request (or it auto-approves). `{torrentId}` is the string form of a search result `id`. Body:

```json
{
  "category": "audiobooks",
  "usePersonalFL": true
}
```

- `category` is the download category name configured in Bookmark's admin settings (defaults: `audiobooks`, `books`, `comics`), chosen from the request's `contentType`. Use it to route the download's **save location** — this is how files end up in the right watched import directory.
- `usePersonalFL` (optional) asks the module to spend a personal freeleech credit before grabbing, if your backend has that concept. Ignore it otherwise.
- `tags`, `paused`, and `savepath` are also defined in the contract but Bookmark does not currently send them; accept and ignore unknown fields.

Response — return once the download has been **accepted** (not completed):

```json
{ "status": "ok", "message": "Download added", "hash": "a94a8fe5cc…" }
```

Every status response includes `acquisitionFailed`. Set it to true only for a conclusively failed acquisition with no live transfer. Never use it for temporary network/authentication errors, downloader absence, paused/stalled transfers, disk/permission problems, uncertain submissions, or import failures. This ends the attempt and returns the original approved request to the availability schedule; history and supporters remain. Return false for missing jobs and ambiguous or temporary failures. Persistent failed-candidate exclusions are separate follow-up work (#110).

`hash` is the critical field: a stable, unique identifier for this download job (for torrent-backed modules, the info-hash; otherwise any unique ID). Bookmark stores it and uses it for all subsequent status lookups.

### `GET /torrent/{hash}` and `GET /torrents?hashes=h1,h2,h3`

Single and bulk download status. Bookmark calls the single endpoint **immediately after** `/download` succeeds, and a scheduler polls the bulk endpoint for all in-flight requests. Bulk `hashes` is one comma-separated query parameter.

Status object (single endpoint returns one; bulk returns `{ "torrents": [ … ] }`):

```json
{
  "hash": "a94a8fe5cc…",
  "name": "Project Hail Mary [M4B]",
  "state": "downloading",
  "progress": 0.42,
  "size": 1288490188,
  "downloaded": 541165879,
  "files": [{ "name": "Project Hail Mary.m4b", "size": 1288490188 }]
}
```

- `hash`, `name`, `state`, `progress` are required. `progress` is a 0–1 fraction.
- `state` is a free-form string. The **only value Bookmark interprets** is `"not_found"`, meaning the download job no longer exists — return it in bulk responses for unknown hashes rather than omitting them (Bookmark logs a warning and leaves the request untouched). Every other state means "the job exists" and moves the request to _downloading_. Conventional values (`downloading`, `stalledDL`, `pausedDL`, `uploading`, `completed`, `seeding`, `error`, …) are listed in the OpenAPI spec for interoperability.
- For the single endpoint, an unknown hash may return 404. Bookmark stores the `hash` from `/download` before this call, so a non-2xx here does not un-approve the request or submit it again. The next bulk poll caches `name` if this call failed. Still resolve a hash you just returned; without `name`, import matching cannot complete the request.

### `GET /image/{torrentId}`

Serve the cover/thumbnail for a search result. Bookmark proxies this to browsers at `/api/requests/cover/{id}`, forwarding your `Content-Type`, `Cache-Control`, and `ETag` headers (defaulting to a one-year immutable cache if you send none). Return 404 when there is no image.

---

## The import-matching invariant

This is the part implementers most often get wrong.

When an approval succeeds, Bookmark immediately fetches `GET /torrent/{hash}` and stores the returned **`name`** as the request's folder name. Later, when the library watcher imports a new item from the import directory, Bookmark links it back to the request by comparing the imported item's top-level folder (or file) name to that stored `name` — an exact string match (`tryMatchImport` in `apps/backend/src/requests/requests.service.ts`).

Therefore:

1. `name` must be the **exact on-disk name** of the top-level folder or file the download will produce inside the import directory.
2. `name` must be **final at approval time** — if your module renames downloads after completion, report the post-rename name from the very first status call.
3. Completed downloads must land in the directory Bookmark watches for the relevant content type (route by the `category` field from `/download`).

If the names don't match, the download still imports into the library — but the request stays stuck in _downloading_ forever instead of flipping to _complete_.

Import matching requires a single active request with the exact folder name and matching requested medium. Ambiguous folder names and a different imported medium do not complete a request. The importer still records and imports the actual content independently.

### Request lifecycle, end to end

1. User searches → Bookmark calls `POST /search` and shows results.
2. User requests an item → stored in Bookmark as _pending_ (or auto-approved if the user has weekly auto-approve budget).
3. Admin approves → Bookmark marks the request _approved_ before calling the module, then `POST /download/{id}` with the configured `category`. Your module returns a `hash`, which Bookmark stores immediately. It then calls `GET /torrent/{hash}` and caches `name`. A failed status call leaves the request approved with its hash; it is not submitted again.
4. A scheduler polls `GET /torrents?hashes=…`; any state other than `not_found` moves the request to _downloading_.
5. Your module finishes the download into the watched import directory.
6. Bookmark's library watcher imports the item, matches the folder name, links the library item to the request, and marks it _complete_.

---

## Wiring a module into Bookmark

1. **Run your module** somewhere the Bookmark backend can reach — typically as another service in the same Docker network.

2. **Point Bookmark at it** via environment variables (already passed through in `docker-compose.yml`):

   ```yaml
   # .env
   TRACKER_CLIENT_URL=http://module:8000
   TRACKER_CLIENT_API_KEY=<long random secret>
   ```

   Both must be set; the user request routes require a configured module.

3. **Share the import directory.** Your module (or the download client behind it) must write completed downloads into the same path Bookmark's backend watches for imports. In Docker terms: mount the same volume into both containers, and map the `category` names to subpaths of it.

4. **Enable requests in Bookmark.** In the admin settings, turn on the requests feature (`requestsEnabled`) and, if needed, adjust the category names (`audiobooks` / `books` / `comics` by default) and the auto-approve / freeleech options.

5. **Grant users permission.** Only users with the _can request content_ permission see the request UI; there is also an instance-wide default for new users.

6. **Verify.** `GET /health` on your module should return 200, and a search from Bookmark's request page should return results.

---

## Verifying your implementation

The OpenAPI spec at [`docs/api/content-request-module.openapi.yaml`](./api/content-request-module.openapi.yaml) is the machine-readable contract. Useful checks:

```bash
# Lint the spec itself (should already pass — useful after local edits)
npx @redocly/cli lint docs/api/content-request-module.openapi.yaml

# Run a mock server from the spec to see exactly what Bookmark expects back
npx @stoplight/prism-cli mock docs/api/content-request-module.openapi.yaml

# Fuzz your real implementation against the contract
npx schemathesis run docs/api/content-request-module.openapi.yaml \
  --url http://localhost:8000 -H "X-API-Key: <your key>"
```

Manual smoke test with curl:

```bash
BASE=http://localhost:8000; KEY=<your key>

curl -fsS $BASE/health
curl -fsS $BASE/languages -H "X-API-Key: $KEY"
curl -fsS -X POST $BASE/search -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"query":"dune","categories":["audiobook","ebook","comics"],"perPage":10,"offset":0}'
curl -fsS -X POST $BASE/download/123456 -H "X-API-Key: $KEY" -H "Content-Type: application/json" -d '{"category":"audiobooks"}'
curl -fsS $BASE/torrent/<hash-from-download> -H "X-API-Key: $KEY"
curl -fsS "$BASE/torrents?hashes=<hash>,deadbeef" -H "X-API-Key: $KEY"   # second hash → state "not_found"
curl -fsS -o /dev/null -w "%{http_code} %{content_type}\n" $BASE/image/123456 -H "X-API-Key: $KEY"
```

Checklist before calling it done:

- [ ] `/health` answers 200 without the API key; every other endpoint rejects a missing/wrong key
- [ ] Search results are clean and pre-parsed; `id` values are stable integers
- [ ] `/download` returns a unique, stable `hash` and routes the save location by `category`
- [ ] The first `GET /torrent/{hash}` after download already reports the final on-disk `name`
- [ ] Bulk status returns `state: "not_found"` for unknown hashes
- [ ] Completed downloads appear in Bookmark's watched import directory under exactly that `name`
- [ ] A full request round-trip in Bookmark ends in status _complete_

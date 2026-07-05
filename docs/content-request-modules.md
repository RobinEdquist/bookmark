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

The machine-readable version of this contract is the OpenAPI spec at
[`docs/api/content-request-module.openapi.yaml`](./api/content-request-module.openapi.yaml).
See [Verifying your implementation](#verifying-your-implementation) for how to test against it.

---

## How Bookmark calls your module

- **Base URL** — Bookmark reads `TRACKER_CLIENT_URL` (e.g. `http://module:8000`) and appends paths directly. No trailing slash.
- **Authentication** — every request except `GET /health` carries the header `X-API-Key: <TRACKER_CLIENT_API_KEY>`. Your module must reject requests with a missing or wrong key (401/403). `GET /health` is probed **without** the key, so it must be unauthenticated.
- **Content type** — Bookmark sends `Content-Type: application/json` and expects JSON back on every endpoint except `/health` (body ignored) and `/image/{id}` (binary image).
- **Errors** — any non-2xx response is treated as a failure: Bookmark logs your response body and surfaces the HTTP status to the user. If your module is unreachable, Bookmark reports 503 "Tracker client unavailable". There are no retries, so make responses fast and reliable; do your own upstream retrying internally.
- **Timeouts** — Bookmark uses default fetch timeouts. Keep search responses in the low seconds; kick off downloads asynchronously and return immediately.

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

The `id` values are **your own** — Bookmark never interprets them, it only passes the user's selection back in the `languages` field of `POST /search`. Return an empty list if your catalog has no language concept; Bookmark then hides the filter (a missing endpoint is treated the same way).

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
- For the single endpoint, an unknown hash may return 404 — but note that Bookmark treats any non-2xx during approval as a failed approval.

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

Matching is deliberately **content-type agnostic**: Bookmark compares folder names only, never the requested content type. Some formats are ambiguous (a PDF can be an ebook or a comic), so whichever importer actually claims the files completes the request, recording the type that was really imported.

### Request lifecycle, end to end

1. User searches → Bookmark calls `POST /search` and shows results.
2. User requests an item → stored in Bookmark as _pending_ (or auto-approved if the user has weekly auto-approve budget).
3. Admin approves → `POST /download/{id}` with the configured `category` → your module returns a `hash` → Bookmark calls `GET /torrent/{hash}` and caches `name`. Request becomes _approved_.
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

   Both must be set; if either is missing, all request endpoints return 503 "Tracker client not configured".

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

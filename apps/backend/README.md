# Simple Audiobook Vault - Backend

NestJS REST API for the Simple Audiobook Vault audiobook management platform.

## Prerequisites

- **Node.js** 20.x or later
- **PostgreSQL** 16.x
- **pnpm** 9.x
- **FFmpeg** (required for M4B chapter extraction)

### Installing FFmpeg

FFmpeg is required to extract chapter information from M4B audiobook files.

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt-get update && sudo apt-get install -y ffmpeg
```

**Alpine Linux (Docker):**
```dockerfile
RUN apk add --no-cache ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH.

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. Run database migrations:
```bash
pnpm db:migrate
```

## Development

```bash
# Start in watch mode
pnpm dev

# Run tests
pnpm test

# Type check
pnpm check-types

# Generate database migrations
pnpm db:generate

# Open Drizzle Studio
pnpm db:studio
```

## API

The backend runs on port 3000 by default and provides:

- `GET /audiobooks` - List audiobooks with filtering and pagination
- `GET /audiobooks/:id` - Get audiobook details
- `PATCH /audiobooks/:id` - Update audiobook metadata
- `POST /audiobooks/:id/refresh-chapters` - Re-extract chapters from audio files
- `GET /audiobooks/:id/cover` - Get audiobook cover image
- `GET /audiobooks/authors` - List authors
- `GET /audiobooks/narrators` - List narrators
- `GET /audiobooks/publishers` - List publishers
- `GET /audiobooks/genres` - List genres
- `GET /audiobooks/tags` - List tags

## Docker

When deploying with Docker, ensure FFmpeg is installed in your image:

```dockerfile
FROM node:20-alpine

RUN apk add --no-cache ffmpeg

# ... rest of your Dockerfile
```

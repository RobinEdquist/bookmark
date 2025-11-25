# Simple Audiobook Vault - Development Guide

> A modern, self-hostable audiobook management platform with Spotify/Apple-quality UI.

## Quick Reference

```bash
# Development
pnpm dev                    # Start all apps (web: 3001, backend: 3000)
pnpm build                  # Build all packages
pnpm lint                   # Lint all packages
pnpm check-types            # Type check all packages
pnpm format                 # Format with Prettier

# Database
cd apps/backend
pnpm db:generate            # Generate migrations from schema changes
pnpm db:migrate             # Run migrations
pnpm db:studio              # Open Drizzle Studio

# Testing
pnpm test                   # Run unit tests
pnpm test:e2e               # Run E2E tests
pnpm test:cov               # Coverage report
```

---

## Project Overview

Simple Audiobook Vault is a self-hosted audiobook management and streaming platform. The goal is to create a polished, production-quality application that rivals commercial products like Spotify and Apple Books.

**Core Principles:**
- Beautiful, intuitive UI with smooth animations
- Robust backend with excellent error handling
- Type-safe throughout the entire stack
- Mobile-first API design for future native apps
- Accessible and internationalized from day one

**Reference Document:** See `docs/scope.md` for the complete feature specification.

---

## Architecture

### Monorepo Structure

```
simple-audiobook-vault/
├── apps/
│   ├── web/                 # Next.js 16 frontend (port 3001)
│   ├── backend/             # NestJS REST API (port 3000)
│   ├── mobile-ios/          # Future: React Native iOS app
│   └── mobile-android/      # Future: React Native Android app
├── packages/
│   ├── ui/                  # Shared React component library
│   ├── shared/              # Shared types, utilities, constants
│   ├── eslint-config/       # Shared ESLint configurations
│   └── typescript-config/   # Shared TypeScript configurations
├── docs/                    # Documentation and design specs
└── turbo.json               # Turborepo configuration
```

### Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Frontend** | Next.js (App Router) | 16.x |
| **UI Framework** | React | 19.x |
| **Styling** | Tailwind CSS | 4.x |
| **Backend** | NestJS | 11.x |
| **Database** | PostgreSQL | 16.x |
| **ORM** | Drizzle ORM | 0.44.x |
| **Auth** | Better Auth | 1.4.x |
| **State** | TanStack React Query | 5.x |
| **Package Manager** | pnpm | 9.x |
| **Monorepo** | Turborepo | 2.x |

### Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│   Next.js   │────▶│   NestJS    │
│   (React)   │◀────│   (Proxy)   │◀────│   Backend   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                           │                    ▼
                           │            ┌─────────────┐
                           │            │  PostgreSQL │
                           │            └─────────────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   Mobile    │     │  Hardcover  │
                    │    Apps     │     │     API     │
                    └─────────────┘     └─────────────┘
```

---

## Code Standards

### TypeScript

**Strictness:** All code must pass TypeScript strict mode. No `any` types unless absolutely necessary and documented.

```typescript
// ✅ Good: Explicit types
interface AudiobookProgress {
  audiobookId: string;
  currentPosition: number;
  completionPercentage: number;
  status: 'not_started' | 'in_progress' | 'finished';
}

// ❌ Bad: Implicit any or loose types
function updateProgress(data: any) { ... }
```

**Naming Conventions:**

| Type | Convention | Example |
|------|------------|---------|
| Files (components) | kebab-case | `audiobook-card.tsx` |
| Files (utilities) | kebab-case | `use-audiobook.ts` |
| Components | PascalCase | `AudiobookCard` |
| Functions/Hooks | camelCase | `useAudiobook` |
| Constants | UPPER_SNAKE_CASE | `DATABASE_CONNECTION` |
| Database tables | snake_case | `user_audiobook_progress` |
| Database columns | snake_case | `created_at` |
| Interfaces/Types | PascalCase | `AudiobookMetadata` |
| Enums | PascalCase | `PlaybackStatus` |

### File Organization

**Backend (NestJS):**
```
src/
├── main.ts                           # Entry point
├── app.module.ts                     # Root module
├── common/                           # Shared utilities
│   ├── decorators/                   # Custom decorators
│   ├── guards/                       # Auth/permission guards
│   ├── filters/                      # Exception filters
│   ├── pipes/                        # Validation pipes
│   └── interceptors/                 # Request/response interceptors
├── database/                         # Database configuration
│   ├── database.module.ts
│   └── database-connection.constants.ts
└── modules/                          # Feature modules
    ├── audiobooks/
    │   ├── audiobooks.controller.ts
    │   ├── audiobooks.service.ts
    │   ├── audiobooks.module.ts
    │   ├── schema.ts                 # Drizzle schema
    │   ├── dto/                      # Data transfer objects
    │   └── __tests__/                # Unit tests
    ├── users/
    ├── auth/
    ├── progress/
    ├── hardcover/
    └── ...
```

**Frontend (Next.js):**
```
app/
├── (auth)/                           # Auth route group
│   ├── login/page.tsx
│   └── signup/page.tsx
├── (app)/                            # Authenticated route group
│   ├── layout.tsx                    # App shell with player
│   ├── page.tsx                      # Home/dashboard
│   ├── library/page.tsx
│   ├── audiobooks/[id]/page.tsx
│   ├── authors/[id]/page.tsx
│   ├── series/[id]/page.tsx
│   └── settings/page.tsx
├── layout.tsx                        # Root layout
├── globals.css
└── not-found.tsx

components/
├── ui/                               # Base UI (from @repo/ui)
├── audiobooks/                       # Audiobook-related components
│   ├── audiobook-card.tsx
│   ├── audiobook-grid.tsx
│   ├── audiobook-detail.tsx
│   └── ...
├── player/                           # Audio player components
│   ├── player-bar.tsx
│   ├── player-controls.tsx
│   ├── chapter-list.tsx
│   └── ...
├── layout/                           # Layout components
│   ├── sidebar.tsx
│   ├── header.tsx
│   └── ...
└── providers/                        # Context providers

lib/
├── api/                              # API client functions
│   ├── audiobooks.ts
│   ├── progress.ts
│   └── ...
├── hooks/                            # Custom hooks
│   ├── use-audiobook.ts
│   ├── use-player.ts
│   └── ...
├── utils/                            # Utility functions
├── types/                            # TypeScript types
└── constants/                        # App constants
```

### Import Order

Always organize imports in this order (enforced by ESLint):

```typescript
// 1. React/Next.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 2. External packages
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

// 3. Internal packages (@repo/*)
import { Button, Card } from '@repo/ui/components';
import { cn } from '@repo/ui/lib/utils';

// 4. Relative imports (parent directories first)
import { usePlayer } from '@/lib/hooks/use-player';
import { fetchAudiobook } from '@/lib/api/audiobooks';

// 5. Types (with type keyword)
import type { Audiobook, Chapter } from '@/lib/types';
```

---

## Backend Development

### Module Structure

Every feature should be a self-contained NestJS module:

```typescript
// audiobooks/audiobooks.module.ts
import { Module } from '@nestjs/common';
import { AudiobooksController } from './audiobooks.controller';
import { AudiobooksService } from './audiobooks.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AudiobooksController],
  providers: [AudiobooksService],
  exports: [AudiobooksService],
})
export class AudiobooksModule {}
```

### Controller Patterns

```typescript
@Controller('audiobooks')
export class AudiobooksController {
  constructor(private readonly audiobooksService: AudiobooksService) {}

  // List with pagination and filters
  @Get()
  async findAll(
    @Query() query: ListAudiobooksDto,
    @Session() session: UserSession,
  ): Promise<PaginatedResponse<AudiobookDto>> {
    return this.audiobooksService.findAll(query, session.user);
  }

  // Get single resource
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Session() session: UserSession,
  ): Promise<AudiobookDto> {
    const audiobook = await this.audiobooksService.findOne(id, session.user);
    if (!audiobook) {
      throw new NotFoundException('Audiobook not found');
    }
    return audiobook;
  }

  // Create (admin/permission required)
  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async create(
    @Body() dto: CreateAudiobookDto,
    @Session() session: UserSession,
  ): Promise<AudiobookDto> {
    return this.audiobooksService.create(dto, session.user);
  }

  // Update (permission required)
  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('edit_metadata')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAudiobookDto,
    @Session() session: UserSession,
  ): Promise<AudiobookDto> {
    return this.audiobooksService.update(id, dto, session.user);
  }

  // Delete (permission required)
  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('delete_audiobook')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Session() session: UserSession,
  ): Promise<void> {
    await this.audiobooksService.remove(id, session.user);
  }
}
```

### Service Patterns

```typescript
@Injectable()
export class AudiobooksService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDatabase,
  ) {}

  async findAll(
    query: ListAudiobooksDto,
    user: User,
  ): Promise<PaginatedResponse<AudiobookDto>> {
    const { page = 1, limit = 20, search, genre, author } = query;
    const offset = (page - 1) * limit;

    // Build dynamic where clause
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(
        or(
          ilike(audiobooks.title, `%${search}%`),
          ilike(audiobooks.author, `%${search}%`),
        ),
      );
    }

    if (genre) {
      conditions.push(eq(audiobooks.genre, genre));
    }

    // Apply user permission filters (e.g., explicit content)
    if (!user.permissions.canSeeExplicitContent) {
      conditions.push(eq(audiobooks.isExplicit, false));
    }

    // Execute query with pagination
    const [items, [{ count }]] = await Promise.all([
      this.db
        .select()
        .from(audiobooks)
        .where(and(...conditions))
        .orderBy(desc(audiobooks.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(audiobooks)
        .where(and(...conditions)),
    ]);

    return {
      items: items.map(this.toDto),
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  private toDto(audiobook: typeof audiobooks.$inferSelect): AudiobookDto {
    return {
      id: audiobook.id,
      title: audiobook.title,
      author: audiobook.author,
      // ... map other fields
      // Never expose internal fields like file paths to clients
    };
  }
}
```

### Database Schema Patterns

```typescript
// schema.ts
import { pgTable, text, timestamp, integer, boolean, uuid, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const audiobooks = pgTable(
  'audiobooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    author: text('author').notNull(),
    narrator: text('narrator'),
    description: text('description'),
    duration: integer('duration').notNull(), // in seconds
    coverUrl: text('cover_url'),
    filePath: text('file_path').notNull(), // internal only
    isExplicit: boolean('is_explicit').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('audiobooks_title_idx').on(table.title),
    index('audiobooks_author_idx').on(table.author),
    index('audiobooks_created_at_idx').on(table.createdAt),
  ],
);

export const audiobookRelations = relations(audiobooks, ({ many, one }) => ({
  chapters: many(chapters),
  series: one(series, {
    fields: [audiobooks.seriesId],
    references: [series.id],
  }),
  progress: many(userProgress),
}));

export const chapters = pgTable('chapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  audiobookId: uuid('audiobook_id')
    .notNull()
    .references(() => audiobooks.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  startTime: integer('start_time').notNull(), // in seconds
  endTime: integer('end_time').notNull(),
  orderIndex: integer('order_index').notNull(),
});
```

### Error Handling

Use NestJS built-in exceptions with consistent error responses:

```typescript
// Custom exception filter for consistent API responses
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message = typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as any).message;
      code = this.getErrorCode(status);
    }

    // Log error for debugging (not in production for 4xx)
    if (status >= 500) {
      console.error('Server Error:', exception);
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
```

---

## Frontend Development

### Component Patterns

**Base Component with Variants (CVA):**

```typescript
// components/ui/audiobook-card.tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@repo/ui/lib/utils';

const audiobookCardVariants = cva(
  'rounded-lg overflow-hidden transition-all duration-200',
  {
    variants: {
      size: {
        sm: 'w-32',
        md: 'w-40',
        lg: 'w-48',
      },
      interactive: {
        true: 'cursor-pointer hover:scale-105 hover:shadow-lg',
        false: '',
      },
    },
    defaultVariants: {
      size: 'md',
      interactive: true,
    },
  },
);

interface AudiobookCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof audiobookCardVariants> {
  audiobook: Audiobook;
  showProgress?: boolean;
}

export function AudiobookCard({
  audiobook,
  size,
  interactive,
  showProgress = true,
  className,
  ...props
}: AudiobookCardProps) {
  return (
    <div
      className={cn(audiobookCardVariants({ size, interactive }), className)}
      {...props}
    >
      <div className="aspect-square relative">
        <Image
          src={audiobook.coverUrl || '/placeholder-cover.jpg'}
          alt={audiobook.title}
          fill
          className="object-cover"
        />
        {showProgress && audiobook.progress && (
          <ProgressBar value={audiobook.progress.percentage} />
        )}
      </div>
      <div className="p-2">
        <h3 className="font-medium text-sm line-clamp-2">{audiobook.title}</h3>
        <p className="text-xs text-muted-foreground line-clamp-1">
          {audiobook.author}
        </p>
      </div>
    </div>
  );
}
```

**Data Fetching with React Query:**

```typescript
// lib/hooks/use-audiobook.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import * as api from '@/lib/api/audiobooks';

export function useAudiobook(id: string) {
  return useQuery({
    queryKey: queryKeys.audiobooks.detail(id),
    queryFn: () => api.getAudiobook(id),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useAudiobooks(filters?: AudiobookFilters) {
  return useQuery({
    queryKey: queryKeys.audiobooks.list(filters),
    queryFn: () => api.getAudiobooks(filters),
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useUpdateProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.updateProgress,
    onSuccess: (data, variables) => {
      // Update the audiobook detail cache
      queryClient.setQueryData(
        queryKeys.audiobooks.detail(variables.audiobookId),
        (old: Audiobook | undefined) =>
          old ? { ...old, progress: data } : old,
      );
      // Invalidate list queries to reflect progress changes
      queryClient.invalidateQueries({
        queryKey: queryKeys.audiobooks.all,
      });
    },
  });
}
```

**Query Keys Factory:**

```typescript
// lib/query-keys.ts
export const queryKeys = {
  audiobooks: {
    all: ['audiobooks'] as const,
    list: (filters?: AudiobookFilters) =>
      [...queryKeys.audiobooks.all, 'list', filters] as const,
    detail: (id: string) =>
      [...queryKeys.audiobooks.all, 'detail', id] as const,
    chapters: (id: string) =>
      [...queryKeys.audiobooks.all, 'chapters', id] as const,
  },
  progress: {
    all: ['progress'] as const,
    byAudiobook: (audiobookId: string) =>
      [...queryKeys.progress.all, audiobookId] as const,
  },
  user: {
    all: ['user'] as const,
    stats: () => [...queryKeys.user.all, 'stats'] as const,
    lists: () => [...queryKeys.user.all, 'lists'] as const,
  },
  hardcover: {
    all: ['hardcover'] as const,
    search: (query: string) =>
      [...queryKeys.hardcover.all, 'search', query] as const,
    book: (id: string) =>
      [...queryKeys.hardcover.all, 'book', id] as const,
  },
} as const;
```

### API Client Pattern

```typescript
// lib/api/client.ts
const API_BASE = '/api';

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      error.error?.code || 'UNKNOWN_ERROR',
      error.error?.message || 'An error occurred',
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),
  patch: <T>(endpoint: string, data: unknown) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: 'DELETE' }),
};
```

### Form Handling

Use controlled components with proper validation:

```typescript
// components/audiobooks/edit-audiobook-form.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  author: z.string().min(1, 'Author is required'),
  narrator: z.string().optional(),
  description: z.string().optional(),
  genres: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof schema>;

export function EditAudiobookForm({ audiobook, onSuccess }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: audiobook.title,
      author: audiobook.author,
      narrator: audiobook.narrator || '',
      description: audiobook.description || '',
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await updateAudiobook(audiobook.id, data);
      toast.success('Audiobook updated successfully');
      onSuccess?.();
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : 'Failed to update audiobook',
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          {...register('title')}
          aria-invalid={!!errors.title}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>
      {/* More fields... */}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save Changes'}
      </Button>
    </form>
  );
}
```

---

## Audio Player Architecture

The audio player is a critical component. It should:

1. **Persist across navigation** - Use a global provider/context
2. **Sync progress** - Update server every 30 seconds
3. **Handle offline** - Queue progress updates when offline
4. **Support chapters** - Navigate between chapters seamlessly

```typescript
// lib/hooks/use-player.ts
interface PlayerState {
  audiobook: Audiobook | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  currentChapter: Chapter | null;
}

interface PlayerActions {
  play: (audiobook: Audiobook, startTime?: number) => void;
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  nextChapter: () => void;
  previousChapter: () => void;
}

// Provider wraps the entire app
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, dispatch] = useReducer(playerReducer, initialState);
  const updateProgress = useUpdateProgress();

  // Sync progress every 30 seconds
  useEffect(() => {
    if (!state.isPlaying || !state.audiobook) return;

    const interval = setInterval(() => {
      updateProgress.mutate({
        audiobookId: state.audiobook!.id,
        currentTime: state.currentTime,
        percentage: (state.currentTime / state.duration) * 100,
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [state.isPlaying, state.audiobook, state.currentTime]);

  // ... implementation
}
```

---

## Styling Guidelines

### Design Tokens

All design values should come from CSS custom properties:

```css
/* packages/ui/src/styles/globals.css */
:root {
  /* Colors - HSL format for easy manipulation */
  --background: 0 0% 100%;
  --foreground: 20 14% 4%;
  --primary: 24 95% 53%;
  --primary-foreground: 0 0% 100%;
  --secondary: 20 14% 96%;
  --muted: 20 14% 96%;
  --muted-foreground: 20 14% 46%;
  --accent: 20 14% 96%;
  --destructive: 0 84% 60%;
  --border: 20 14% 90%;
  --ring: 24 95% 53%;

  /* Spacing */
  --radius: 0.5rem;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}

.dark {
  --background: 20 14% 6%;
  --foreground: 30 20% 94%;
  --primary: 30 90% 50%;
  --primary-foreground: 20 14% 4%;
  --secondary: 20 14% 14%;
  --muted: 20 14% 14%;
  --muted-foreground: 20 14% 64%;
  --accent: 20 14% 14%;
  --destructive: 0 70% 50%;
  --border: 20 14% 18%;
  --ring: 30 90% 50%;
}
```

### Animation Guidelines

Use subtle, purposeful animations:

```typescript
// Preferred: CSS transitions for simple state changes
className="transition-all duration-200 ease-out"

// For complex animations, use Framer Motion
import { motion, AnimatePresence } from 'framer-motion';

<AnimatePresence>
  {isVisible && (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      Content
    </motion.div>
  )}
</AnimatePresence>
```

### Responsive Design

Mobile-first approach with these breakpoints:

```typescript
// Tailwind breakpoints (use consistently)
sm: '640px'   // Small tablets
md: '768px'   // Tablets
lg: '1024px'  // Laptops
xl: '1280px'  // Desktops
2xl: '1536px' // Large screens

// Example usage
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
  {audiobooks.map(book => <AudiobookCard key={book.id} audiobook={book} />)}
</div>
```

---

## Testing Strategy

### Unit Tests (Jest)

Focus on business logic, utilities, and complex functions:

```typescript
// services/__tests__/audiobooks.service.spec.ts
describe('AudiobooksService', () => {
  let service: AudiobooksService;
  let mockDb: jest.Mocked<DrizzleDatabase>;

  beforeEach(async () => {
    mockDb = createMockDb();
    const module = await Test.createTestingModule({
      providers: [
        AudiobooksService,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
      ],
    }).compile();
    service = module.get(AudiobooksService);
  });

  describe('findAll', () => {
    it('should filter explicit content for users without permission', async () => {
      const user = createMockUser({ canSeeExplicitContent: false });
      await service.findAll({}, user);

      expect(mockDb.select).toHaveBeenCalled();
      // Assert that explicit filter was applied
    });
  });
});
```

### E2E Tests (Playwright)

Test critical user flows:

```typescript
// e2e/audiobook-playback.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Audiobook Playback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loginAsUser(page);
  });

  test('should play audiobook and track progress', async ({ page }) => {
    // Navigate to library
    await page.getByRole('link', { name: 'Library' }).click();

    // Click on first audiobook
    await page.getByTestId('audiobook-card').first().click();

    // Start playback
    await page.getByRole('button', { name: 'Play' }).click();

    // Verify player is visible and playing
    await expect(page.getByTestId('player-bar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    // Wait for progress sync
    await page.waitForTimeout(5000);

    // Verify progress was saved
    const progress = await page.getByTestId('progress-bar').getAttribute('aria-valuenow');
    expect(Number(progress)).toBeGreaterThan(0);
  });
});
```

### Component Tests (Testing Library)

Test component behavior and accessibility:

```typescript
// components/__tests__/audiobook-card.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AudiobookCard } from '../audiobook-card';

describe('AudiobookCard', () => {
  const mockAudiobook = {
    id: '1',
    title: 'Test Audiobook',
    author: 'Test Author',
    coverUrl: '/test-cover.jpg',
  };

  it('renders audiobook information', () => {
    render(<AudiobookCard audiobook={mockAudiobook} />);

    expect(screen.getByText('Test Audiobook')).toBeInTheDocument();
    expect(screen.getByText('Test Author')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Test Audiobook');
  });

  it('calls onClick when clicked', async () => {
    const onClick = jest.fn();
    render(<AudiobookCard audiobook={mockAudiobook} onClick={onClick} />);

    await userEvent.click(screen.getByRole('article'));
    expect(onClick).toHaveBeenCalledWith(mockAudiobook);
  });

  it('shows progress when provided', () => {
    const audiobookWithProgress = {
      ...mockAudiobook,
      progress: { percentage: 50 },
    };
    render(<AudiobookCard audiobook={audiobookWithProgress} showProgress />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });
});
```

---

## Performance Guidelines

### Backend Performance

1. **Database Queries:**
   - Always use indexes for filtered/sorted columns
   - Use `select()` to fetch only needed columns
   - Paginate all list endpoints
   - Use connection pooling

2. **Caching:**
   - Cache Hardcover API responses (Redis, 5-60 min TTL)
   - Cache cover art on disk
   - Use HTTP caching headers for static assets

3. **Audio Streaming:**
   - Support range requests for seeking
   - Stream files, don't load into memory
   - Consider CDN for production

### Frontend Performance

1. **Code Splitting:**
   - Use dynamic imports for heavy components
   - Route-based code splitting (automatic with Next.js)

2. **Images:**
   - Always use Next.js `<Image>` component
   - Provide appropriate sizes for responsive images
   - Use WebP format when possible

3. **State Management:**
   - Use React Query for server state (handles caching)
   - Avoid unnecessary re-renders with proper memoization
   - Keep client state minimal

```typescript
// Example: Lazy load heavy components
const AudioPlayer = dynamic(() => import('@/components/player/audio-player'), {
  loading: () => <PlayerSkeleton />,
  ssr: false, // Audio doesn't work on server
});
```

---

## Security Guidelines

### Authentication

- All authenticated routes require valid session
- Use `@AllowAnonymous()` decorator for public endpoints
- Implement rate limiting for auth endpoints
- Hash API keys before storing

### Authorization

- Check permissions on every request (use guards)
- Never trust client-side permission checks alone
- Filter data based on user permissions (explicit content, etc.)

### Input Validation

- Validate all input with class-validator (backend)
- Validate all forms with Zod (frontend)
- Sanitize user-generated content before display

### File Handling

- Never expose internal file paths to clients
- Validate file types on upload
- Use secure streaming for audio files
- Implement download tokens with expiration

```typescript
// Example: Secure audio streaming endpoint
@Get(':id/stream')
async streamAudio(
  @Param('id') id: string,
  @Session() session: UserSession,
  @Res() res: Response,
  @Headers('range') range?: string,
) {
  const audiobook = await this.audiobooksService.findOne(id, session.user);
  if (!audiobook) {
    throw new NotFoundException();
  }

  // Verify user has access
  if (!this.audiobooksService.canAccess(audiobook, session.user)) {
    throw new ForbiddenException();
  }

  // Stream file with range support
  const filePath = audiobook.filePath;
  const stat = await fs.stat(filePath);

  if (range) {
    // Handle range request for seeking
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

    res.status(206).set({
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': 'audio/mpeg',
    });

    createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.set({
      'Content-Length': stat.size,
      'Content-Type': 'audio/mpeg',
    });
    createReadStream(filePath).pipe(res);
  }
}
```

---

## Internationalization (i18n)

Use `next-intl` for internationalization:

### Setup

```typescript
// i18n/config.ts
export const locales = ['en', 'es', 'de', 'fr'] as const;
export const defaultLocale = 'en' as const;
export type Locale = (typeof locales)[number];

// messages/en.json
{
  "common": {
    "loading": "Loading...",
    "error": "An error occurred",
    "save": "Save",
    "cancel": "Cancel"
  },
  "audiobook": {
    "by": "by {author}",
    "narratedBy": "Narrated by {narrator}",
    "duration": "{hours}h {minutes}m",
    "progress": "{percentage}% complete"
  },
  "player": {
    "play": "Play",
    "pause": "Pause",
    "skipForward": "Skip forward {seconds} seconds",
    "skipBackward": "Skip backward {seconds} seconds"
  }
}
```

### Usage

```typescript
import { useTranslations } from 'next-intl';

export function AudiobookInfo({ audiobook }: Props) {
  const t = useTranslations('audiobook');

  return (
    <div>
      <h1>{audiobook.title}</h1>
      <p>{t('by', { author: audiobook.author })}</p>
      <p>{t('narratedBy', { narrator: audiobook.narrator })}</p>
      <p>{t('duration', { hours: 12, minutes: 34 })}</p>
    </div>
  );
}
```

---

## Mobile App Considerations

When building features, always consider how they'll work on native mobile apps:

### API Design

- RESTful with consistent response formats
- Support for JWT authentication (in addition to cookies)
- Efficient pagination for infinite scroll
- Batch endpoints for reducing requests

```typescript
// Example: Batch endpoint for mobile efficiency
@Post('batch')
async getBatch(
  @Body() dto: BatchRequestDto,
  @Session() session: UserSession,
): Promise<BatchResponse> {
  const [audiobooks, progress, lists] = await Promise.all([
    dto.audiobookIds
      ? this.audiobooksService.findByIds(dto.audiobookIds, session.user)
      : [],
    dto.includeProgress
      ? this.progressService.findForUser(session.user.id)
      : [],
    dto.includeLists
      ? this.listsService.findForUser(session.user.id)
      : [],
  ]);

  return { audiobooks, progress, lists };
}
```

### Offline Support

- Design APIs to support offline-first mobile apps
- Use queue-based progress sync
- Consider download manifest format

### WebSocket Events

```typescript
// Real-time sync events for mobile apps
interface ProgressSyncEvent {
  type: 'progress_update';
  audiobookId: string;
  currentTime: number;
  percentage: number;
  deviceId: string;
}

interface LibraryUpdateEvent {
  type: 'library_update';
  action: 'added' | 'removed' | 'updated';
  audiobookId: string;
}
```

---

## Git Workflow

### Branch Naming

```
feature/audiobook-player
feature/hardcover-integration
fix/progress-sync-race-condition
chore/upgrade-dependencies
docs/api-documentation
```

### Commit Messages

Follow conventional commits:

```
feat(player): add variable playback speed support
fix(progress): resolve race condition in progress sync
docs(api): add streaming endpoint documentation
chore(deps): upgrade tanstack-query to v5.80
refactor(audiobooks): extract metadata parsing logic
test(player): add e2e tests for chapter navigation
```

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Documentation
- [ ] Tests

## Testing
- [ ] Unit tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual testing completed

## Screenshots (if applicable)

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] Translations added for new strings
- [ ] Mobile API compatibility considered
```

---

## Deployment Checklist

Before deploying to production:

### Security
- [ ] Environment variables are properly set
- [ ] CORS is configured correctly
- [ ] Rate limiting is enabled
- [ ] Session secrets are secure and unique
- [ ] File upload limits are configured

### Performance
- [ ] Database indexes are in place
- [ ] Static assets have cache headers
- [ ] Images are optimized
- [ ] Gzip/Brotli compression enabled

### Monitoring
- [ ] Error tracking configured (Sentry, etc.)
- [ ] Logging is set up properly
- [ ] Health check endpoint exists
- [ ] Database connection monitoring

### Data
- [ ] Database migrations are applied
- [ ] Backup strategy is in place
- [ ] Media storage is configured

---

## Resources

- **Scope Document:** `docs/scope.md`
- **API Documentation:** `docs/api/` (generate with Swagger)
- **Component Storybook:** Run `pnpm storybook` (when implemented)
- **Hardcover API:** https://hardcover.app/graphql

---

*This document is the authoritative guide for development. When in doubt, refer here first.*

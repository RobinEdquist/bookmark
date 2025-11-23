# Signup Control & Admin Role Design

## Overview

Wrap better-auth's signup endpoint to control whether signups are allowed, and automatically assign the first user the "admin" role.

## Components

### 1. App Settings Table

Single-row table with typed columns for application-wide settings.

```sql
CREATE TABLE app_settings (
  id TEXT PRIMARY KEY DEFAULT 'app_settings' CHECK (id = 'app_settings'),
  signups_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

- Single row enforced by check constraint on `id`
- New settings added as columns via migrations
- `signups_enabled` defaults to `true`

### 2. App Settings Module

```
src/app-settings/
  ├── app-settings.module.ts    # Global module, exports AppSettingsService
  ├── app-settings.service.ts   # CRUD operations for settings
  └── schema.ts                 # Drizzle schema for app_settings table
```

**AppSettingsService methods:**
- `getSettings()` - Returns current settings, creates default row if none exists
- `updateSettings(partial)` - Updates specific fields
- `isSignupEnabled()` - Convenience method for the guard

Module is `@Global()` so any module can inject without importing.

### 3. Better-Auth Admin Plugin

Add the admin plugin to better-auth configuration:

```typescript
import { admin } from 'better-auth/plugins';

betterAuth({
  plugins: [
    admin({
      defaultRole: 'user',
    }),
  ],
})
```

**Schema additions** (run `npx @better-auth/cli generate`):
- `user.role` - string, defaults to "user"
- `user.banned` - boolean
- `user.banReason` - string
- `user.banExpires` - timestamp
- `session.impersonatedBy` - string

### 4. First User Admin Hook

Post-signup hook promotes the first user to admin:

```typescript
betterAuth({
  plugins: [admin()],
  user: {
    hooks: {
      after: {
        createUser: async ({ user }, ctx) => {
          const userCount = await db.select({ count: count() }).from(userTable);
          if (userCount[0].count === 1) {
            await ctx.auth.api.setRole({ userId: user.id, role: 'admin' });
          }
        }
      }
    }
  }
})
```

### 5. Signup Guard

NestJS guard that intercepts better-auth's signup route:

```typescript
@Injectable()
export class SignupGuard implements CanActivate {
  constructor(
    private appSettingsService: AppSettingsService,
    @Inject(DATABASE_CONNECTION) private db: NodePgDatabase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    if (!request.path.includes('/sign-up')) {
      return true;
    }

    // Always allow if no users exist (first admin setup)
    const users = await this.db.select({ id: user.id }).from(user).limit(1);
    if (users.length === 0) {
      return true;
    }

    // After first user, check if signups are enabled
    const enabled = await this.appSettingsService.isSignupEnabled();
    if (!enabled) {
      throw new ForbiddenException('Signups are currently disabled');
    }

    return true;
  }
}
```

**Logic:**
- No users → always allow (first admin must sign up)
- Users exist + signups enabled → allow
- Users exist + signups disabled → block with 403

## Flow

1. Fresh install: no users, no settings row
2. First user hits `/sign-up` → guard allows (no users)
3. Better-auth creates user with role "user"
4. Post-signup hook detects count=1, promotes to "admin"
5. Settings row created with `signups_enabled: true`
6. Admin can disable signups via settings endpoint
7. Subsequent signup attempts blocked if disabled

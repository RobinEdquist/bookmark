import { Injectable, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { userPermissions } from '../users/schema';
import * as authSchema from '../auth/schema';
import type { AuthenticatedUser } from '../common/guards/auth.guard';

type Schema = typeof authSchema & { userPermissions: typeof userPermissions };

@Injectable()
export class MobileAuthService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<Schema>,
  ) {}

  /**
   * Same rule as ApiKeyPermissionGuard, minus the HTTP exceptions — the
   * mobile-auth flow must answer with a bookmark:// redirect the app can
   * show, never a JSON error page stranded inside the browser sheet.
   */
  async canGenerateApiKeys(
    user: Pick<AuthenticatedUser, 'id' | 'role'>,
  ): Promise<boolean> {
    if (user.role === 'admin') {
      return true;
    }

    const permissions = await this.db
      .select({ canGenerateApiKeys: userPermissions.canGenerateApiKeys })
      .from(userPermissions)
      .where(eq(userPermissions.userId, user.id))
      .limit(1);

    return permissions.length > 0 && !!permissions[0].canGenerateApiKeys;
  }
}

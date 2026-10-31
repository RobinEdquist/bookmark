import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import * as usersSchema from '../users/schema';

/**
 * The controller guards, repeated for MCP tools.
 *
 * Tools call services directly, so nothing in Nest's guard chain sees which
 * tool runs. Each tool calls the check its REST equivalent's guard makes, with
 * the same rule: admins always pass, others need the permission row.
 */
@Injectable()
export class McpAccessService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof usersSchema>,
  ) {}

  async canEditMetadata(user: AuthenticatedUser): Promise<boolean> {
    if (user.role === 'admin') return true;
    const [permissions] = await this.db
      .select({ canEditMetadata: usersSchema.userPermissions.canEditMetadata })
      .from(usersSchema.userPermissions)
      .where(eq(usersSchema.userPermissions.userId, user.id))
      .limit(1);
    return permissions?.canEditMetadata ?? false;
  }

  /** Same rule as CanEditMetadataGuard. */
  async requireEditMetadata(user: AuthenticatedUser): Promise<void> {
    if (!(await this.canEditMetadata(user))) {
      throw new ForbiddenException(
        'You do not have permission to edit metadata',
      );
    }
  }

  /** Same rule as RolesGuard with @Roles('admin'). */
  requireAdmin(user: AuthenticatedUser, what: string): void {
    if (user.role !== 'admin') {
      throw new ForbiddenException(`${what} is for admins only`);
    }
  }
}

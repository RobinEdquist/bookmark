import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database-connection.constants';
import * as usersSchema from '../../users/schema';
import { getAuthenticatedUser } from './auth.guard';

@Injectable()
export class CanDeleteGuard implements CanActivate {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof usersSchema>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = getAuthenticatedUser(request);

    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    // Admins always have access
    if (user.role === 'admin') {
      return true;
    }

    // Check if user has permission
    const [permissions] = await this.db
      .select({
        canDelete: usersSchema.userPermissions.canDelete,
      })
      .from(usersSchema.userPermissions)
      .where(eq(usersSchema.userPermissions.userId, user.id))
      .limit(1);

    if (!permissions?.canDelete) {
      throw new ForbiddenException(
        'You do not have permission to delete content',
      );
    }

    return true;
  }
}

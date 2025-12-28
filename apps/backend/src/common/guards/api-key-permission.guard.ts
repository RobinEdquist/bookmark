import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database-connection.constants';
import { userPermissions } from '../../users/schema';
import * as authSchema from '../../auth/schema';
import { getAuthenticatedUser } from './auth.guard';

type Schema = typeof authSchema & { userPermissions: typeof userPermissions };

@Injectable()
export class ApiKeyPermissionGuard implements CanActivate {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<Schema>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = getAuthenticatedUser(request);

    if (!user) {
      throw new UnauthorizedException();
    }

    // Admins always have permission
    if (user.role === 'admin') {
      return true;
    }

    // Check user permission
    const permissions = await this.db
      .select({ canGenerateApiKeys: userPermissions.canGenerateApiKeys })
      .from(userPermissions)
      .where(eq(userPermissions.userId, user.id))
      .limit(1);

    if (permissions.length === 0 || !permissions[0].canGenerateApiKeys) {
      throw new ForbiddenException('API key generation not permitted');
    }

    return true;
  }
}

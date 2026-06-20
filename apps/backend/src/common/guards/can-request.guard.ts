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
import * as appSettingsSchema from '../../app-settings/schema';
import * as usersSchema from '../../users/schema';
import { TrackerService } from '../../tracker';
import { getAuthenticatedUser } from './auth.guard';

type CombinedSchema = typeof appSettingsSchema & typeof usersSchema;

@Injectable()
export class CanRequestGuard implements CanActivate {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<CombinedSchema>,
    private tracker: TrackerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = getAuthenticatedUser(request);

    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    // Check if tracker client is configured
    if (!this.tracker.isConfigured()) {
      throw new ForbiddenException('Content requests are not configured');
    }

    // Check if requests are enabled globally
    const [settings] = await this.db
      .select({
        requestsEnabled: appSettingsSchema.appSettings.requestsEnabled,
      })
      .from(appSettingsSchema.appSettings)
      .where(eq(appSettingsSchema.appSettings.id, 'app_settings'))
      .limit(1);

    if (!settings?.requestsEnabled) {
      throw new ForbiddenException('Content requests are disabled');
    }

    // Admins always have access when requests are enabled
    if (user.role === 'admin') {
      return true;
    }

    // Check if user has permission
    const [permissions] = await this.db
      .select({
        canRequestContent: usersSchema.userPermissions.canRequestContent,
      })
      .from(usersSchema.userPermissions)
      .where(eq(usersSchema.userPermissions.userId, user.id))
      .limit(1);

    if (!permissions?.canRequestContent) {
      throw new ForbiddenException(
        'You do not have permission to request content',
      );
    }

    return true;
  }
}

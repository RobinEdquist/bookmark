import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { user } from './schema';

@Injectable()
export class SignupGuard implements CanActivate {
  constructor(
    private appSettingsService: AppSettingsService,
    @Inject(DATABASE_CONNECTION) private db: NodePgDatabase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Only check signup routes
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

import { Controller, Get, Inject } from '@nestjs/common';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from '../auth/schema';

@Controller('users')
export class UsersController {
  constructor(
    @Inject(DATABASE_CONNECTION) private db: NodePgDatabase<typeof schema>,
  ) {}

  @Get('session')
  getSession(@Session() session: UserSession) {
    return session.user;
  }

  @Get('setup-admin-completed')
  @AllowAnonymous()
  async getSetupAdminCompleted() {
    const users = await this.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .limit(1);
    return { setupCompleted: users.length > 0 };
  }
}

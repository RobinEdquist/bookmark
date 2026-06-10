import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, ilike, or, and, SQL } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { randomUUID } from 'crypto';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as authSchema from '../auth/schema';
import { apiKey } from '../auth/api-key.schema';
import { parseLastIp } from '../api-keys/api-key-metadata.util';
import * as userSchema from './schema';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto, BanUserDto } from './dto/update-user.dto';
import type {
  UserResponse,
  UserListResponse,
  UserPermissionsResponse,
} from './dto/user-response.dto';

type Schema = typeof authSchema & typeof userSchema & { apiKey: typeof apiKey };

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<Schema>,
  ) {}

  async findAll(search?: string): Promise<UserListResponse> {
    let whereClause: SQL | undefined;
    if (search) {
      whereClause = or(
        ilike(authSchema.user.name, `%${search}%`),
        ilike(authSchema.user.email, `%${search}%`),
      );
    }

    const users = await this.db
      .select()
      .from(authSchema.user)
      .where(whereClause)
      .orderBy(authSchema.user.createdAt);

    const usersWithPermissions = await Promise.all(
      users.map(async (user) => this.toUserResponse(user)),
    );

    return {
      users: usersWithPermissions,
      total: users.length,
    };
  }

  async findById(userId: string): Promise<UserResponse> {
    const users = await this.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId))
      .limit(1);

    if (users.length === 0) {
      throw new NotFoundException('User not found');
    }

    return this.toUserResponse(users[0]);
  }

  async create(dto: CreateUserDto): Promise<UserResponse> {
    const isAdmin = dto.isAdmin ?? false;

    // Check if email already exists
    const existingUser = await this.db
      .select({ id: authSchema.user.id })
      .from(authSchema.user)
      .where(eq(authSchema.user.email, dto.email))
      .limit(1);

    if (existingUser.length > 0) {
      throw new ConflictException('User with this email already exists');
    }

    // Generate IDs and hash password using better-auth's password hashing
    const userId = randomUUID();
    const accountId = randomUUID();
    const hashedPassword = await hashPassword(dto.password);

    // Create the user
    await this.db.insert(authSchema.user).values({
      id: userId,
      email: dto.email,
      name: dto.name,
      emailVerified: true, // Admin-created users are pre-verified
      role: isAdmin ? 'admin' : 'user',
    });

    // Create the account with password (better-auth stores password in account table)
    await this.db.insert(authSchema.account).values({
      id: accountId,
      userId,
      accountId: userId,
      providerId: 'credential',
      password: hashedPassword,
    });

    // Create permissions (admins have all permissions)
    await this.db.insert(userSchema.userPermissions).values({
      userId,
      canEditMetadata: isAdmin ? true : (dto.canEditMetadata ?? false),
      canUpload: isAdmin ? true : (dto.canUpload ?? false),
      canDelete: isAdmin ? true : (dto.canDelete ?? false),
      canGenerateApiKeys: isAdmin ? true : (dto.canGenerateApiKeys ?? false),
      canRequestContent: isAdmin ? true : (dto.canRequestContent ?? false),
    });

    // Create blacklisted tags (admins have no blacklisted tags)
    if (!isAdmin && dto.blacklistedTags && dto.blacklistedTags.length > 0) {
      await this.db
        .insert(userSchema.userBlacklistedTags)
        .values(dto.blacklistedTags.map((tagId) => ({ userId, tagId })));
    }

    return this.findById(userId);
  }

  async update(
    userId: string,
    dto: UpdateUserDto,
    adminUserId: string,
  ): Promise<UserResponse> {
    const user = await this.findById(userId);

    // Prevent admin from removing their own admin role
    if (
      userId === adminUserId &&
      dto.isAdmin === false &&
      user.role === 'admin'
    ) {
      throw new ForbiddenException('Cannot remove your own admin role');
    }

    // Determine if user will be admin after update
    const willBeAdmin =
      dto.isAdmin !== undefined ? dto.isAdmin : user.role === 'admin';

    // Build user update fields
    const userUpdates: Partial<typeof authSchema.user.$inferInsert> = {};
    if (dto.name !== undefined) userUpdates.name = dto.name;
    if (dto.email !== undefined) userUpdates.email = dto.email;
    if (dto.isAdmin !== undefined)
      userUpdates.role = dto.isAdmin ? 'admin' : 'user';

    // Apply user updates if any
    if (Object.keys(userUpdates).length > 0) {
      await this.db
        .update(authSchema.user)
        .set(userUpdates)
        .where(eq(authSchema.user.id, userId));
    }

    // Update permissions (admins have all permissions)
    if (willBeAdmin) {
      // Force all permissions to true for admins
      await this.db
        .insert(userSchema.userPermissions)
        .values({
          userId,
          canEditMetadata: true,
          canUpload: true,
          canDelete: true,
          canGenerateApiKeys: true,
          canRequestContent: true,
        })
        .onConflictDoUpdate({
          target: userSchema.userPermissions.userId,
          set: {
            canEditMetadata: true,
            canUpload: true,
            canDelete: true,
            canGenerateApiKeys: true,
            canRequestContent: true,
          },
        });

      // Clear blacklisted tags for admins
      await this.db
        .delete(userSchema.userBlacklistedTags)
        .where(eq(userSchema.userBlacklistedTags.userId, userId));
    } else {
      // Update permissions for non-admin users
      const permUpdates: Partial<
        typeof userSchema.userPermissions.$inferInsert
      > = {};
      if (dto.canEditMetadata !== undefined)
        permUpdates.canEditMetadata = dto.canEditMetadata;
      if (dto.canUpload !== undefined) permUpdates.canUpload = dto.canUpload;
      if (dto.canDelete !== undefined) permUpdates.canDelete = dto.canDelete;
      if (dto.canGenerateApiKeys !== undefined)
        permUpdates.canGenerateApiKeys = dto.canGenerateApiKeys;
      if (dto.canRequestContent !== undefined)
        permUpdates.canRequestContent = dto.canRequestContent;

      if (Object.keys(permUpdates).length > 0) {
        await this.db
          .insert(userSchema.userPermissions)
          .values({ userId, ...permUpdates })
          .onConflictDoUpdate({
            target: userSchema.userPermissions.userId,
            set: permUpdates,
          });
      }

      // Update blacklisted tags for non-admin users
      if (dto.blacklistedTags !== undefined) {
        await this.db
          .delete(userSchema.userBlacklistedTags)
          .where(eq(userSchema.userBlacklistedTags.userId, userId));

        if (dto.blacklistedTags.length > 0) {
          await this.db
            .insert(userSchema.userBlacklistedTags)
            .values(dto.blacklistedTags.map((tagId) => ({ userId, tagId })));
        }
      }
    }

    return this.findById(userId);
  }

  async ban(
    userId: string,
    dto: BanUserDto,
    adminUserId: string,
  ): Promise<UserResponse> {
    if (userId === adminUserId) {
      throw new ForbiddenException('Cannot ban yourself');
    }

    // Update ban status directly in database
    await this.db
      .update(authSchema.user)
      .set({
        banned: true,
        banReason: dto.reason ?? null,
        banExpires: dto.expiresAt ? new Date(dto.expiresAt) : null,
      })
      .where(eq(authSchema.user.id, userId));

    return this.findById(userId);
  }

  async unban(userId: string): Promise<UserResponse> {
    // Clear ban status directly in database
    await this.db
      .update(authSchema.user)
      .set({
        banned: false,
        banReason: null,
        banExpires: null,
      })
      .where(eq(authSchema.user.id, userId));

    return this.findById(userId);
  }

  async delete(userId: string, adminUserId: string): Promise<void> {
    if (userId === adminUserId) {
      throw new ForbiddenException('Cannot delete yourself');
    }

    // Delete our custom data first (permissions and blacklisted tags)
    await this.db
      .delete(userSchema.userBlacklistedTags)
      .where(eq(userSchema.userBlacklistedTags.userId, userId));
    await this.db
      .delete(userSchema.userPermissions)
      .where(eq(userSchema.userPermissions.userId, userId));

    // Delete sessions for this user
    await this.db
      .delete(authSchema.session)
      .where(eq(authSchema.session.userId, userId));

    // Delete accounts for this user
    await this.db
      .delete(authSchema.account)
      .where(eq(authSchema.account.userId, userId));

    // Delete the user
    await this.db.delete(authSchema.user).where(eq(authSchema.user.id, userId));
  }

  async getPermissions(userId: string): Promise<UserPermissionsResponse> {
    // Check if user is admin - admins have all permissions
    const userRecord = await this.db
      .select({ role: authSchema.user.role })
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId))
      .limit(1);

    const isAdmin = userRecord.length > 0 && userRecord[0].role === 'admin';

    if (isAdmin) {
      return {
        isAdmin: true,
        canEditMetadata: true,
        canUpload: true,
        canDelete: true,
        canGenerateApiKeys: true,
        canRequestContent: true,
      };
    }

    const perms = await this.db
      .select()
      .from(userSchema.userPermissions)
      .where(eq(userSchema.userPermissions.userId, userId))
      .limit(1);

    if (perms.length === 0) {
      return {
        isAdmin: false,
        canEditMetadata: false,
        canUpload: false,
        canDelete: false,
        canGenerateApiKeys: false,
        canRequestContent: false,
      };
    }

    return {
      isAdmin: false,
      canEditMetadata: perms[0].canEditMetadata,
      canUpload: perms[0].canUpload,
      canDelete: perms[0].canDelete,
      canGenerateApiKeys: perms[0].canGenerateApiKeys,
      canRequestContent: perms[0].canRequestContent,
    };
  }

  async getBlacklistedTags(userId: string): Promise<string[]> {
    const tags = await this.db
      .select({ tagId: userSchema.userBlacklistedTags.tagId })
      .from(userSchema.userBlacklistedTags)
      .where(eq(userSchema.userBlacklistedTags.userId, userId));

    return tags.map((t) => t.tagId);
  }

  async getApiKeyInfo(userId: string): Promise<{
    count: number;
    lastUsed: string | null;
    lastIp: string | null;
  } | null> {
    const keys = await this.db
      .select({
        lastRequest: apiKey.lastRequest,
        metadata: apiKey.metadata,
      })
      .from(apiKey)
      .where(and(eq(apiKey.userId, userId), eq(apiKey.enabled, true)));

    if (keys.length === 0) return null;

    let mostRecent = keys[0];
    for (const key of keys) {
      if (
        key.lastRequest &&
        (!mostRecent.lastRequest || key.lastRequest > mostRecent.lastRequest)
      ) {
        mostRecent = key;
      }
    }

    return {
      count: keys.length,
      lastUsed: mostRecent.lastRequest?.toISOString() ?? null,
      lastIp: mostRecent.lastRequest ? parseLastIp(mostRecent.metadata) : null,
    };
  }

  private async toUserResponse(
    user: typeof authSchema.user.$inferSelect,
  ): Promise<UserResponse> {
    const [permissions, blacklistedTags, apiKeyInfo] = await Promise.all([
      this.getPermissions(user.id),
      this.getBlacklistedTags(user.id),
      this.getApiKeyInfo(user.id),
    ]);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      permissions,
      blacklistedTags,
      apiKey: apiKeyInfo,
    };
  }

  // Existing methods
  async updateLanguage(userId: string, language: string): Promise<void> {
    await this.db
      .update(authSchema.user)
      .set({ language })
      .where(eq(authSchema.user.id, userId));
  }

  async getLanguage(userId: string): Promise<string> {
    const result = await this.db
      .select({ language: authSchema.user.language })
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId))
      .limit(1);

    return result[0]?.language ?? 'en';
  }

  async updateTheme(
    userId: string,
    primaryColor: string,
    surfaceColor: string,
  ): Promise<void> {
    await this.db
      .update(authSchema.user)
      .set({ primaryColor, surfaceColor })
      .where(eq(authSchema.user.id, userId));
  }

  async getTheme(
    userId: string,
  ): Promise<{ primaryColor: string; surfaceColor: string }> {
    const result = await this.db
      .select({
        primaryColor: authSchema.user.primaryColor,
        surfaceColor: authSchema.user.surfaceColor,
      })
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId))
      .limit(1);

    return {
      primaryColor: result[0]?.primaryColor ?? 'orange',
      surfaceColor: result[0]?.surfaceColor ?? 'espresso',
    };
  }
}

import { Injectable, Inject, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, ilike, or } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as authSchema from '../auth/schema';
import * as userSchema from './schema';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto, BanUserDto } from './dto/update-user.dto';
import type { UserResponse, UserListResponse, UserPermissionsResponse } from './dto/user-response.dto';

type Schema = typeof authSchema & typeof userSchema;

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<Schema>,
  ) {}

  async findAll(search?: string): Promise<UserListResponse> {
    let whereClause;
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
    // Check if email exists
    const existing = await this.db
      .select({ id: authSchema.user.id })
      .from(authSchema.user)
      .where(eq(authSchema.user.email, dto.email))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('Email already exists');
    }

    // Hash password using better-auth's hashing function
    const passwordHash = await hashPassword(dto.password);

    // Generate user ID
    const userId = crypto.randomUUID();

    // Create user
    await this.db.insert(authSchema.user).values({
      id: userId,
      name: dto.name,
      email: dto.email,
      role: dto.isAdmin ? 'admin' : 'user',
      emailVerified: true,
    });

    // Create account with password
    await this.db.insert(authSchema.account).values({
      id: crypto.randomUUID(),
      userId,
      accountId: userId,
      providerId: 'credential',
      password: passwordHash,
    });

    // Create permissions (admins have all permissions)
    const isAdmin = dto.isAdmin ?? false;
    await this.db.insert(userSchema.userPermissions).values({
      userId,
      canEditMetadata: isAdmin ? true : (dto.canEditMetadata ?? false),
      canUploadAudiobooks: isAdmin ? true : (dto.canUploadAudiobooks ?? false),
      canDeleteAudiobooks: isAdmin ? true : (dto.canDeleteAudiobooks ?? false),
      canGenerateApiKeys: isAdmin ? true : (dto.canGenerateApiKeys ?? false),
    });

    // Create blacklisted tags (admins have no blacklisted tags)
    if (!isAdmin && dto.blacklistedTags && dto.blacklistedTags.length > 0) {
      await this.db.insert(userSchema.userBlacklistedTags).values(
        dto.blacklistedTags.map((tag) => ({ userId, tag })),
      );
    }

    return this.findById(userId);
  }

  async update(userId: string, dto: UpdateUserDto, adminUserId: string): Promise<UserResponse> {
    const user = await this.findById(userId);

    // Prevent admin from removing their own admin role
    if (userId === adminUserId && dto.isAdmin === false && user.role === 'admin') {
      throw new ForbiddenException('Cannot remove your own admin role');
    }

    // Determine if user will be admin after update
    const willBeAdmin = dto.isAdmin !== undefined ? dto.isAdmin : user.role === 'admin';

    // Update user fields
    const userUpdates: Partial<typeof authSchema.user.$inferInsert> = {};
    if (dto.name !== undefined) userUpdates.name = dto.name;
    if (dto.email !== undefined) userUpdates.email = dto.email;
    if (dto.image !== undefined) userUpdates.image = dto.image;
    if (dto.isAdmin !== undefined) userUpdates.role = dto.isAdmin ? 'admin' : 'user';

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
          canUploadAudiobooks: true,
          canDeleteAudiobooks: true,
          canGenerateApiKeys: true,
        })
        .onConflictDoUpdate({
          target: userSchema.userPermissions.userId,
          set: {
            canEditMetadata: true,
            canUploadAudiobooks: true,
            canDeleteAudiobooks: true,
            canGenerateApiKeys: true,
          },
        });

      // Clear blacklisted tags for admins
      await this.db
        .delete(userSchema.userBlacklistedTags)
        .where(eq(userSchema.userBlacklistedTags.userId, userId));
    } else {
      // Update permissions for non-admin users
      const permUpdates: Partial<typeof userSchema.userPermissions.$inferInsert> = {};
      if (dto.canEditMetadata !== undefined) permUpdates.canEditMetadata = dto.canEditMetadata;
      if (dto.canUploadAudiobooks !== undefined) permUpdates.canUploadAudiobooks = dto.canUploadAudiobooks;
      if (dto.canDeleteAudiobooks !== undefined) permUpdates.canDeleteAudiobooks = dto.canDeleteAudiobooks;
      if (dto.canGenerateApiKeys !== undefined) permUpdates.canGenerateApiKeys = dto.canGenerateApiKeys;

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
          await this.db.insert(userSchema.userBlacklistedTags).values(
            dto.blacklistedTags.map((tag) => ({ userId, tag })),
          );
        }
      }
    }

    return this.findById(userId);
  }

  async ban(userId: string, dto: BanUserDto, adminUserId: string): Promise<UserResponse> {
    if (userId === adminUserId) {
      throw new ForbiddenException('Cannot ban yourself');
    }

    await this.db
      .update(authSchema.user)
      .set({
        banned: true,
        banReason: dto.reason ?? null,
        banExpires: dto.expiresAt ? new Date(dto.expiresAt) : null,
      })
      .where(eq(authSchema.user.id, userId));

    // Invalidate all sessions
    await this.db
      .delete(authSchema.session)
      .where(eq(authSchema.session.userId, userId));

    return this.findById(userId);
  }

  async unban(userId: string): Promise<UserResponse> {
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

    await this.db
      .delete(authSchema.user)
      .where(eq(authSchema.user.id, userId));

    // Note: cascade will delete permissions, blacklisted tags, sessions, accounts
  }

  async getPermissions(userId: string): Promise<UserPermissionsResponse> {
    const perms = await this.db
      .select()
      .from(userSchema.userPermissions)
      .where(eq(userSchema.userPermissions.userId, userId))
      .limit(1);

    if (perms.length === 0) {
      return {
        canEditMetadata: false,
        canUploadAudiobooks: false,
        canDeleteAudiobooks: false,
        canGenerateApiKeys: false,
      };
    }

    return {
      canEditMetadata: perms[0].canEditMetadata,
      canUploadAudiobooks: perms[0].canUploadAudiobooks,
      canDeleteAudiobooks: perms[0].canDeleteAudiobooks,
      canGenerateApiKeys: perms[0].canGenerateApiKeys,
    };
  }

  async getBlacklistedTags(userId: string): Promise<string[]> {
    const tags = await this.db
      .select({ tag: userSchema.userBlacklistedTags.tag })
      .from(userSchema.userBlacklistedTags)
      .where(eq(userSchema.userBlacklistedTags.userId, userId));

    return tags.map((t) => t.tag);
  }

  private async toUserResponse(user: typeof authSchema.user.$inferSelect): Promise<UserResponse> {
    const [permissions, blacklistedTags] = await Promise.all([
      this.getPermissions(user.id),
      this.getBlacklistedTags(user.id),
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
}

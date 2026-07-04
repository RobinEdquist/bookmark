import { ApiProperty } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/guards/auth.guard';

/**
 * The caller's own authenticated identity, as returned by GET /users/session.
 * Mirrors the {@link AuthenticatedUser} interface resolved by the auth guard.
 */
export class AuthenticatedUserDto implements AuthenticatedUser {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'John Doe' })
  name!: string;

  @ApiProperty({ example: 'john@example.com' })
  email!: string;

  @ApiProperty({ example: true })
  emailVerified!: boolean;

  @ApiProperty({ type: String, nullable: true, example: null })
  image!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'user' })
  role!: string | null;

  @ApiProperty({ type: Boolean, nullable: true, example: false })
  banned!: boolean | null;

  @ApiProperty({ type: String, nullable: true })
  banReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  banExpires!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

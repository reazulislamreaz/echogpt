import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserMessageResponseDto } from './dto/user-message-response.dto';
import { UserResponseDto } from './dto/user-response.dto';

export type UserWithRole = User & {
  role?: {
    id: string;
    name: string;
    description: string | null;
  } | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Finds a user by unique ID including their assigned role.
   */
  async findById(id: string): Promise<UserWithRole | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
      },
    });
  }

  /**
   * Finds all users with their assigned role and returns safe DTOs.
   */
  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      include: {
        role: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return users.map((user) => this.toSafeUser(user));
  }

  /**
   * Finds a user by normalized email including their assigned role.
   */
  async findByEmail(email: string): Promise<UserWithRole | null> {
    const normalizedEmail = email.trim().toLowerCase();
    return this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        role: true,
      },
    });
  }

  /**
   * Finds a role by name (e.g. 'USER', 'ADMIN').
   */
  async findRoleByName(name: string) {
    return this.prisma.role.findUnique({
      where: { name },
    });
  }

  /**
   * Retrieves the authenticated user profile in safe representation.
   */
  async getCurrentUserProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User account does not exist');
    }
    this.validateAccountStatus(user);
    return this.toSafeUser(user);
  }

  /**
   * Updates allowed profile attributes (firstName, lastName, avatarUrl).
   */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserResponseDto> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User account does not exist');
    }
    this.validateAccountStatus(user);

    const dataToUpdate: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) {
      dataToUpdate.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      dataToUpdate.lastName = dto.lastName;
    }
    if (dto.avatarUrl !== undefined) {
      dataToUpdate.avatarUrl = dto.avatarUrl;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
      include: {
        role: true,
      },
    });

    return this.toSafeUser(updated);
  }

  /**
   * Validates current password, hashes new password, updates database,
   * and revokes all active refresh-token sessions in a transaction.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<UserMessageResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User account does not exist');
    }

    this.validateAccountStatus(user);

    const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('Current password is incorrect');
    }

    const isSamePassword = await bcrypt.compare(dto.newPassword, user.passwordHash);
    if (isSamePassword) {
      throw new BadRequestException('New password cannot be the same as current password');
    }

    const saltRounds = this.configService.get<number>('app.auth.bcryptSaltRounds', 10);
    const newPasswordHash = await bcrypt.hash(dto.newPassword, saltRounds);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });

      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return {
      message: 'Password changed successfully. Please log in again with your new password.',
    };
  }

  /**
   * Soft-deletes user account by setting deletedAt and isActive = false,
   * and revokes all active sessions in a single transaction.
   */
  async softDeleteAccount(userId: string): Promise<UserMessageResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User account does not exist');
    }

    this.validateAccountStatus(user);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return { message: 'Account successfully deleted' };
  }

  /**
   * Revokes all active refresh-token sessions for a user.
   */
  async revokeUserSessions(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Creates a new user record.
   */
  async create(data: Prisma.UserCreateInput): Promise<UserWithRole> {
    return this.prisma.user.create({
      data,
      include: {
        role: true,
      },
    });
  }

  /**
   * Updates an existing user record.
   */
  async update(id: string, data: Prisma.UserUpdateInput): Promise<UserWithRole> {
    return this.prisma.user.update({
      where: { id },
      data,
      include: {
        role: true,
      },
    });
  }

  /**
   * Validates account status. Throws UnauthorizedException if user is deactivated or deleted.
   */
  validateAccountStatus(user: { isActive: boolean; deletedAt: Date | null }): void {
    if (user.deletedAt !== null) {
      throw new UnauthorizedException('User account has been deleted');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }
  }

  /**
   * Transforms a Prisma User entity into a safe public DTO, stripping sensitive fields.
   */
  toSafeUser(user: UserWithRole): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      role: user.role?.name ?? 'USER',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

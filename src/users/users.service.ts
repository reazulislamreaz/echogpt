import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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

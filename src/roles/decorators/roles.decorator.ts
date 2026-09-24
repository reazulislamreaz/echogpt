import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { RoleType } from '../enums/role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: (RoleType | string)[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);

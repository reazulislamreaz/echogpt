import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { RoleType } from '../../roles/enums/role.enum';

export class AdminUpdateUserRoleDto {
  @ApiProperty({
    enum: RoleType,
    example: RoleType.USER,
    description: 'Target role name. Only USER or ADMIN are accepted.',
  })
  @IsEnum(RoleType)
  role!: RoleType;
}

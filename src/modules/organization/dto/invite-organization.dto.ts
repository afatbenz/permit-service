import { IsEmail, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { RoleCode } from '../../../common/enums/role-code.enum';

export class InviteOrganizationDto {
  @IsEmail()
  email: string;

  @IsEnum(RoleCode)
  roleCode: RoleCode;

  @IsUUID()
  @IsOptional()
  projectId?: string;
}

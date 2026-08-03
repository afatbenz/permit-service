import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class JoinOrganizationDto {
  @IsString()
  @IsNotEmpty()
  inviteToken: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  phone: string;
}

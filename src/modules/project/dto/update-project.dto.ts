import { IsOptional, IsString } from 'class-validator';

/** Partial project edit (name for now; extend as needed). */
export class UpdateProjectDto {
  @IsString()
  @IsOptional()
  name?: string;
}

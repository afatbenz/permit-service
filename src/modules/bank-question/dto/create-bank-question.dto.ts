import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/** Adds a checklist question to a project's bank, tied to a permit category. */
export class CreateBankQuestionDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  questionEn: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  questionId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

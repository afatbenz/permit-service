import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PermitAnswerInput } from './permit-answer.dto';

/** Updates a permit's work-activity fields (all optional). */
export class UpdatePermitDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** Replace the full answer set when provided. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermitAnswerInput)
  questions?: PermitAnswerInput[];
  @IsOptional()
  @IsString()
  @MaxLength(500)
  workTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contractorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsString()
  workDesc?: string;
}

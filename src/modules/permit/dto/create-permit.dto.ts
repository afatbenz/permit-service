import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PermitAnswerInput } from './permit-answer.dto';

/** Payload for creating a permit-to-work record (draft). */
export class CreatePermitDto {
  @IsUUID()
  projectId: string;

  /** Chosen "Kategori Permit" driving the checklist questions. */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** Checklist answers (many question_id → yes/no pairs). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermitAnswerInput)
  questions?: PermitAnswerInput[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  workTitle: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  department: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  contractorName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  location1: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location2?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  province: string;

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

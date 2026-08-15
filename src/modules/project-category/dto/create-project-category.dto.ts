import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CATEGORY_COLOR_PALETTE } from '../category-color-palette';

/** Adds a category to a specific project (or recolors a default by name). */
export class CreateProjectCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsIn([...CATEGORY_COLOR_PALETTE])
  color: string;
}

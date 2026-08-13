import { IsIn } from 'class-validator';
import { CATEGORY_COLOR_PALETTE } from '../category-color-palette';

/** Changes the color of a project category. */
export class UpdateProjectCategoryDto {
  @IsIn([...CATEGORY_COLOR_PALETTE])
  color: string;
}

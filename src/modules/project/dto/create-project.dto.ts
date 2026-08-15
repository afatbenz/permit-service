import { IsNotEmpty, IsString, Matches } from 'class-validator';

/** Creates a project under the caller's organization. */
export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  /** Human-chosen project code, unique per organization. */
  @IsString()
  @Matches(/^[A-Z0-9-]{3,20}$/, {
    message: 'Kode proyek hanya huruf besar, angka, atau tanda hubung, 3-20 karakter',
  })
  projectCode: string;
}

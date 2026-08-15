import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PermitStatus } from '../../../common/enums/permit-status.enum';

/**
 * Advances a permit's workflow. `rejectionReason` is required when status is
 * REJECTED (validated in the service for a clearer message).
 */
export class UpdatePermitStatusDto {
  @IsEnum(PermitStatus)
  status: PermitStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}

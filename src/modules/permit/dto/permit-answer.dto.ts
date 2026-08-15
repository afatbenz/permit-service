import { IsBoolean, IsUUID } from 'class-validator';

/**
 * One checklist answer: the picked bank question and the yes/no response.
 * Sent as part of the `questions[]` array on permit create/update.
 */
export class PermitAnswerInput {
  @IsUUID()
  questionId: string;

  /** yes = true, no = false */
  @IsBoolean()
  answer: boolean;
}

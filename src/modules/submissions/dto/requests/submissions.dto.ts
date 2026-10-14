import { GradeSubmissionBody, SaveAnswersBody } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class SaveAnswersDto extends createZodDto(SaveAnswersBody) {}
export class GradeSubmissionDto extends createZodDto(GradeSubmissionBody) {}

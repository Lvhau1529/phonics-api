import { CreateQuestionBody, QuestionListQuery, UpdateQuestionBody } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class QuestionListQueryDto extends createZodDto(QuestionListQuery) {}
export class CreateQuestionDto extends createZodDto(CreateQuestionBody) {}
export class UpdateQuestionDto extends createZodDto(UpdateQuestionBody) {}

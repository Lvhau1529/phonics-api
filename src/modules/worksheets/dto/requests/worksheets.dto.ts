import {
  CreateWorksheetBody,
  UpdateWorksheetBody,
  WorksheetListQuery,
  WorksheetStructureBody,
} from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class WorksheetListQueryDto extends createZodDto(WorksheetListQuery) {}
export class CreateWorksheetDto extends createZodDto(CreateWorksheetBody) {}
export class UpdateWorksheetDto extends createZodDto(UpdateWorksheetBody) {}
export class WorksheetStructureDto extends createZodDto(WorksheetStructureBody) {}

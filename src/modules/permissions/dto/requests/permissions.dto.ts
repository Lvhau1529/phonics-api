import {
  CreatePermissionGroupBody,
  SetUserPermissionGroupsBody,
  UpdatePermissionGroupBody,
  UpdateUserPermissionsBody,
} from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class UpdateUserPermissionsDto extends createZodDto(UpdateUserPermissionsBody) {}
export class SetUserPermissionGroupsDto extends createZodDto(SetUserPermissionGroupsBody) {}
export class CreatePermissionGroupDto extends createZodDto(CreatePermissionGroupBody) {}
export class UpdatePermissionGroupDto extends createZodDto(UpdatePermissionGroupBody) {}

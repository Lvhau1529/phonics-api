import {
  ApproveFamilyBody,
  ChildInput,
  ConvertFamilyBody,
  CreateGuardianBody,
  GuardianListQuery,
  MergeFamilyBody,
  RegisterFamilyBody,
  RejectFamilyBody,
  SetPasswordBody,
  SetStudentGuardiansBody,
  SwitchProfileBody,
  UpdateChildBody,
  UpdateGuardianBody,
  UpdateMyGuardianBody,
} from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class RegisterFamilyDto extends createZodDto(RegisterFamilyBody) {}
export class SwitchProfileDto extends createZodDto(SwitchProfileBody) {}
export class SetPasswordDto extends createZodDto(SetPasswordBody) {}
export class ChildInputDto extends createZodDto(ChildInput) {}
export class UpdateChildDto extends createZodDto(UpdateChildBody) {}
export class UpdateMyGuardianDto extends createZodDto(UpdateMyGuardianBody) {}
export class ApproveFamilyDto extends createZodDto(ApproveFamilyBody) {}
export class RejectFamilyDto extends createZodDto(RejectFamilyBody) {}
export class MergeFamilyDto extends createZodDto(MergeFamilyBody) {}
export class GuardianListQueryDto extends createZodDto(GuardianListQuery) {}
export class CreateGuardianDto extends createZodDto(CreateGuardianBody) {}
export class UpdateGuardianDto extends createZodDto(UpdateGuardianBody) {}
export class SetStudentGuardiansDto extends createZodDto(SetStudentGuardiansBody) {}
export class ConvertFamilyDto extends createZodDto(ConvertFamilyBody) {}

import { PickType } from '@nestjs/swagger';
import type { ICreateEditionStaff } from '@concurso/shared-types';
import { EditionStaff } from '../entities/edition-staff.entity.js';

export class CreateEditionStaffDto extends PickType(EditionStaff, [
    'staff_user_id',
    'role',
] as const) implements ICreateEditionStaff {}

import { IsEnum } from 'class-validator';
import { StaffRole } from '@concurso/shared-types';

export class UpdateEditionStaffDto {

    @IsEnum(StaffRole)
    declare role: StaffRole;
}

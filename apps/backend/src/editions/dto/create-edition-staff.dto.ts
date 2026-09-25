import { IsEnum, IsInt, Min } from 'class-validator';
import { StaffRole, type ICreateEditionStaff } from '@concurso/shared-types';

export class CreateEditionStaffDto implements ICreateEditionStaff {

    @IsInt()
    @Min(1)
    declare staff_user_id: number;

    @IsEnum(StaffRole)
    declare role: StaffRole;
}

import { IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import type { IScheduleEdition } from '@concurso/shared-types';

export class ScheduleEditionDto implements IScheduleEdition {

    @Type(() => Date)
    @IsDate()
    declare scheduled_start: Date;
}

import { PickType } from '@nestjs/swagger';
import type { IScheduleEdition } from '@concurso/shared-types';
import { Edition } from '../entities/edition.entity.js';

export class ScheduleEditionDto extends PickType(Edition, [
    'scheduled_start',
] as const) implements IScheduleEdition {

    // En el entity es nullable (Borrador), pero al programar es obligatoria; @IsDate() del entity rechaza null
    declare scheduled_start: Date;
}

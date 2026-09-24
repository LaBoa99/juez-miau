import { PickType } from '@nestjs/swagger';
import type { ICreateEdition } from '@concurso/shared-types';
import { Edition } from '../entities/edition.entity.js';

export class CreateEditionDto extends PickType(Edition, [
    'name',
    'duration_ms',
    'freeze_duration_ms',
    'block_submissions_on_alert',
] as const) implements ICreateEdition {}

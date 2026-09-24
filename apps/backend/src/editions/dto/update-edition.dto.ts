import { PartialType } from '@nestjs/swagger';
import type { IUpdateEdition } from '@concurso/shared-types';
import { CreateEditionDto } from './create-edition.dto.js';

export class UpdateEditionDto extends PartialType(CreateEditionDto) implements IUpdateEdition {}

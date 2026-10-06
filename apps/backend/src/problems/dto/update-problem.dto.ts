import { OmitType, PartialType } from '@nestjs/swagger';
import type { IUpdateProblem } from '@concurso/shared-types';
import { CreateProblemDto } from './create-problem.dto.js';

// Solo el texto del problema (RF-18): lo que afecta veredictos va por testsets
export class UpdateProblemDto extends PartialType(OmitType(CreateProblemDto, ['categoryId', 'points'] as const)) implements IUpdateProblem {}

import { Pipe, PipeTransform } from '@angular/core';
import { ProblemStatus } from '@concurso/shared-types';

export interface ProblemStatusView {
  label: string;
  tone: 'neutral' | 'warning' | 'success';
}

const STATUS_VIEW: Record<ProblemStatus, ProblemStatusView> = {
  [ProblemStatus.DRAFT]: { label: 'Borrador', tone: 'neutral' },
  [ProblemStatus.READY]: { label: 'Propuesto', tone: 'warning' },
  [ProblemStatus.PUBLISHED]: { label: 'En el concurso', tone: 'success' },
};

@Pipe({ name: 'problemStatus' })
export class ProblemStatusPipe implements PipeTransform {
  transform(status: ProblemStatus): ProblemStatusView {
    return STATUS_VIEW[status];
  }
}

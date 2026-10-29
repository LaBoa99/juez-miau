import { Pipe, PipeTransform } from '@angular/core';
import { EditionStatus } from '@concurso/shared-types';

export interface EditionStatusView {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'solid';
}

const STATUS_VIEW: Record<EditionStatus, EditionStatusView> = {
  [EditionStatus.DRAFT]: { label: 'Borrador', tone: 'neutral' },
  [EditionStatus.SCHEDULED]: { label: 'Programada', tone: 'warning' },
  [EditionStatus.RUNNING]: { label: 'En curso', tone: 'success' },
  [EditionStatus.PAUSED]: { label: 'Pausada', tone: 'warning' },
  [EditionStatus.FINISHED]: { label: 'Finalizada', tone: 'solid' },
};

@Pipe({ name: 'editionStatus' })
export class EditionStatusPipe implements PipeTransform {
  transform(status: EditionStatus): EditionStatusView {
    return STATUS_VIEW[status];
  }
}

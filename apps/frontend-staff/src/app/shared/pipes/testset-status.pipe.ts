import { Pipe, PipeTransform } from '@angular/core';
import { TestsetStatus } from '@concurso/shared-types';

export interface TestsetStatusView {
  label: string;
  tone: 'neutral' | 'warning' | 'success' | 'danger';
}

const STATUS_VIEW: Record<TestsetStatus, TestsetStatusView> = {
  [TestsetStatus.DRAFT]: { label: 'Borrador', tone: 'neutral' },
  [TestsetStatus.BUILDING]: { label: 'Construyendo', tone: 'warning' },
  [TestsetStatus.READY]: { label: 'Lista', tone: 'success' },
  [TestsetStatus.FAILED]: { label: 'Falló', tone: 'danger' },
};

@Pipe({ name: 'testsetStatus' })
export class TestsetStatusPipe implements PipeTransform {
  transform(status: TestsetStatus): TestsetStatusView {
    return STATUS_VIEW[status];
  }
}

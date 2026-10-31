import { Pipe, PipeTransform } from '@angular/core';
import { SubmissionStatus, Verdict } from '@concurso/shared-types';

export interface VerdictView {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  dashed: boolean;
}

const VERDICT_VIEW: Record<Verdict, VerdictView> = {
  [Verdict.AC]: { label: 'AC', tone: 'success', dashed: false },
  [Verdict.WA]: { label: 'WA', tone: 'danger', dashed: false },
  [Verdict.CE]: { label: 'CE', tone: 'danger', dashed: false },
  [Verdict.RE]: { label: 'RE', tone: 'danger', dashed: false },
  [Verdict.TLE]: { label: 'TLE', tone: 'warning', dashed: false },
  [Verdict.MLE]: { label: 'MLE', tone: 'warning', dashed: false },
  [Verdict.PENDING_REVIEW]: { label: 'REVISIÓN', tone: 'warning', dashed: true },
};

// El estado manda mientras no hay veredicto (en cola / evaluando / error del sistema);
// con status DONE se muestra el veredicto.
@Pipe({ name: 'verdict' })
export class VerdictPipe implements PipeTransform {
  transform(verdict: Verdict | null, status: SubmissionStatus): VerdictView {
    switch (status) {
      case SubmissionStatus.QUEUED:
        return { label: 'EN COLA', tone: 'neutral', dashed: false };
      case SubmissionStatus.JUDGING:
        return { label: 'EVALUANDO', tone: 'neutral', dashed: false };
      case SubmissionStatus.ERROR:
        return { label: 'ERROR', tone: 'danger', dashed: false };
      default:
        return verdict ? VERDICT_VIEW[verdict] : { label: '—', tone: 'neutral', dashed: false };
    }
  }
}

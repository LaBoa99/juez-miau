import { Pipe, PipeTransform } from '@angular/core';
import { SubmissionStatus, Verdict } from '@concurso/shared-types';

export interface VerdictView {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  dashed: boolean;
  // Significado de la etiqueta (tooltip)
  hint: string;
}

const VERDICT_VIEW: Record<Verdict, VerdictView> = {
  [Verdict.AC]: { label: 'AC', tone: 'success', dashed: false, hint: 'Aceptado: pasó todos los casos.' },
  [Verdict.WA]: { label: 'WA', tone: 'danger', dashed: false, hint: 'Respuesta incorrecta: regresó un resultado distinto al esperado.' },
  [Verdict.CE]: { label: 'CE', tone: 'danger', dashed: false, hint: 'Error de compilación: el código no compiló.' },
  [Verdict.RE]: { label: 'RE', tone: 'danger', dashed: false, hint: 'Error de ejecución: el programa terminó con un error al correr.' },
  [Verdict.TLE]: { label: 'TLE', tone: 'warning', dashed: false, hint: 'Tiempo excedido: tardó más del límite de tiempo.' },
  [Verdict.MLE]: { label: 'MLE', tone: 'warning', dashed: false, hint: 'Memoria excedida: usó más memoria del límite.' },
  [Verdict.PENDING_REVIEW]: { label: 'REVISIÓN', tone: 'warning', dashed: true, hint: 'En revisión: pasó los casos y espera la revisión de un juez.' },
};

const QUEUED: VerdictView = { label: 'EN COLA', tone: 'neutral', dashed: false, hint: 'En cola: esperando turno para evaluarse.' };
const JUDGING: VerdictView = { label: 'EVALUANDO', tone: 'neutral', dashed: false, hint: 'Evaluando: se está corriendo contra los casos de prueba.' };
const ERROR: VerdictView = { label: 'ERROR', tone: 'danger', dashed: false, hint: 'Error del sistema, no del programa: hay que re-evaluarlo.' };
const NONE: VerdictView = { label: '—', tone: 'neutral', dashed: false, hint: 'Sin veredicto.' };

// El estado manda mientras no hay veredicto (en cola / evaluando / error del sistema);
// con status DONE se muestra el veredicto.
@Pipe({ name: 'verdict' })
export class VerdictPipe implements PipeTransform {
  transform(verdict: Verdict | null, status: SubmissionStatus): VerdictView {
    switch (status) {
      case SubmissionStatus.QUEUED:
        return QUEUED;
      case SubmissionStatus.JUDGING:
        return JUDGING;
      case SubmissionStatus.ERROR:
        return ERROR;
      default:
        return verdict ? VERDICT_VIEW[verdict] : NONE;
    }
  }
}

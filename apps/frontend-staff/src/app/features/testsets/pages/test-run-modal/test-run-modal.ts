import { TooltipDirective } from '../../../../shared/ui/tooltip.directive';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ITestRun, SubmissionStatus, Verdict } from '@concurso/shared-types';
import { Modal } from '../../../../shared/ui/modal.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { Badge } from '../../../../shared/ui/badge.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { FileDrop } from '../../../../shared/ui/file-drop.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { VerdictPipe } from '../../../../shared/pipes/verdict.pipe';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { formatCaseInput } from '../../../../shared/samples';
import { TestsetsService } from '../../data/testsets.service';

const POLL_MS = 1000;

// Prueba una solución (subida aquí o la oficial) contra los casos construidos, como si fuera un
// envío, sin que cuente para el marcador. El resultado vive una hora en el backend.
@Component({
  selector: 'oj-test-run-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TooltipDirective, ReactiveFormsModule, Modal, Alert, Badge, ButtonDirective, FileDrop, FormField, VerdictPipe],
  templateUrl: './test-run-modal.html',
  styleUrl: './test-run-modal.css',
})
export class TestRunModal {
  private readonly service = inject(TestsetsService);

  readonly testsetId = input.required<number>();
  readonly languages = input.required<{ id: string; code: string }[]>();
  // Verificar o probar la oficial terminó con todos los casos bien
  readonly passed = output<'ref' | 'verify'>();

  private readonly modal = viewChild.required(Modal);
  // ref: probar la oficial · custom: probar otra · verify: ver las salidas antes de construir
  protected readonly mode = signal<'ref' | 'custom' | 'verify'>('custom');
  protected readonly run = signal<ITestRun | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly starting = signal(false);
  protected readonly lang = new FormControl<string | null>(null, [Validators.required]);
  protected readonly source = signal('');
  protected readonly DONE = SubmissionStatus.DONE;

  protected readonly running = computed(() => {
    const s = this.run()?.status;
    return s === 'queued' || s === 'running';
  });
  protected readonly maxTime = computed(() => Math.max(0, ...(this.run()?.cases ?? []).map((c) => c.timeMs)));

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopPoll());
  }

  openRef(): void {
    this.reset('ref');
    this.modal().open();
    this.start({ useRefSolution: true });
  }

  openVerify(): void {
    this.reset('verify');
    this.modal().open();
    this.start({ verify: true });
  }

  // Abre con un resultado ya terminado (p. ej. la verificación que corrió "Verificar y construir")
  showRun(run: ITestRun, mode: 'ref' | 'verify'): void {
    this.reset(mode);
    this.run.set(run);
    this.modal().open();
  }

  openCustom(): void {
    this.reset('custom');
    this.modal().open();
  }

  protected close(): void {
    this.modal().close();
  }

  // Esc, la × o "Cerrar": deja de consultar
  protected onClosed(): void {
    this.stopPoll();
  }

  protected onFile(file: File): void {
    file.text().then((text) => this.source.set(text));
  }

  protected submitCustom(): void {
    if (this.lang.invalid || !this.source()) {
      this.error.set('Elige el lenguaje y sube o pega la solución.');
      return;
    }
    this.start({ languageId: this.lang.value!, source: this.source() });
  }

  // En un traceback lo útil es el final ("ValueError: ..."); el texto completo va en el title
  protected lastLine(message: string | null): string {
    return message?.trim().split('\n').at(-1) ?? '';
  }

  // La memoria llega en KB; en MB con 3 decimales se lee mejor
  protected mb(kb: number): string {
    return (kb / 1024).toFixed(3);
  }

  protected caseInput(json: string | undefined): string {
    return json ? formatCaseInput(json) : '';
  }

  protected again(): void {
    this.reset('custom');
  }

  private reset(mode: 'ref' | 'custom' | 'verify'): void {
    this.stopPoll();
    this.mode.set(mode);
    this.run.set(null);
    this.error.set(null);
    this.lang.reset(null);
    this.source.set('');
  }

  private start(dto: { useRefSolution?: boolean; verify?: boolean; languageId?: string; source?: string }): void {
    this.error.set(null);
    this.starting.set(true);
    this.service.startTestRun(this.testsetId(), dto).subscribe({
      next: (run) => {
        this.starting.set(false);
        this.run.set(run);
        this.poll(run.id);
      },
      error: (err) => {
        this.starting.set(false);
        this.error.set(backendMessage(err, 'No se pudo iniciar la prueba.'));
      },
    });
  }

  private poll(runId: string): void {
    this.stopPoll();
    this.timer = setInterval(() => {
      this.service.getTestRun(this.testsetId(), runId).subscribe({
        next: (run) => {
          this.run.set(run);
          if (run.status === 'done' || run.status === 'failed') this.stopPoll();
          const mode = this.mode();
          if (run.status === 'done' && run.verdict === Verdict.AC && mode !== 'custom') this.passed.emit(mode);
          if (run.status === 'failed') {
            console.error('[test-run]', run.error);
            this.error.set('La prueba falló por un error del sistema. Intenta de nuevo.');
          }
        },
        error: (err) => {
          this.stopPoll();
          this.error.set(backendMessage(err, 'No se pudo consultar la prueba.'));
        },
      });
    }, POLL_MS);
  }

  private stopPoll(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

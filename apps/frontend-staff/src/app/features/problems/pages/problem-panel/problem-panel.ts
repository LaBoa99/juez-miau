import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { EditionStatus, IProblemDetail, IProblemPreview, IProblemSignature, ProblemStatus, StaffRole, TestsetStatus } from '@concurso/shared-types';
import { AuthService } from '../../../../core/auth/auth.service';
import { ProblemStatusPipe } from '../../../../shared/pipes/problem-status.pipe';
import { renderMarkdown } from '../../../../shared/markdown';
import { formatCaseInput } from '../../../../shared/samples';
import { signatureToString } from '../../../../shared/type-ref';
import { MarkdownEditor } from '../../../../shared/ui/markdown-editor/markdown-editor.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Segmented } from '../../../../shared/ui/segmented.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { FileDrop } from '../../../../shared/ui/file-drop.component';
import {
  defaultTestsetId,
  TestsetProgress,
  testsetProgress,
  TestsetStep,
  TestsetWorkspace,
} from '../../../testsets/pages/testset-workspace/testset-workspace';
import { TestsetsService } from '../../../testsets/data/testsets.service';
import { Stepper, StepperItem } from '../../../../shared/ui/stepper.component';
import { ProblemsService } from '../../data/problems.service';
import { ProblemsBus } from '../../data/problems-bus';
import { EditionContext } from '../../../editions/pages/edition-layout/edition-context';
import { backendMessage } from '../../../../core/http/backend-error.mapper';

import { withMessage } from '../../../../shared/validators';
import { clearDraft, loadDraft, saveDraft } from '../../../../shared/draft';
@Component({
  selector: 'oj-problem-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ButtonDirective, Badge, Alert, FormField, Segmented, EmptyState, ConfirmDialog, TestsetWorkspace, MarkdownEditor, Stepper, ProblemStatusPipe, FileDrop],
  templateUrl: './problem-panel.html',
  styleUrl: './problem-panel.css',
})
export class ProblemPanel {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(ProblemsService);
  private readonly testsets = inject(TestsetsService);
  private readonly bus = inject(ProblemsBus);
  private readonly ctx = inject(EditionContext);
  private readonly fb = inject(FormBuilder);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly auth = inject(AuthService);

  protected readonly editionId = findEditionId(this.route);
  // La ruta 'nuevo' no lleva :problemId; leemos el último segmento de ESTA ruta
  // ('nuevo' o el id) para no pedir al backend un problema inexistente en modo nuevo.
  private readonly param = toSignal(this.route.url.pipe(map((segs) => segs.at(-1)?.path ?? null)), {
    initialValue: this.route.snapshot.url.at(-1)?.path ?? null,
  });
  protected readonly isNew = computed(() => this.param() === 'nuevo');

  // Paso visible (?paso=casos): uno a la vez. En "nuevo" solo existe Datos.
  private readonly pasoParam = toSignal(this.route.queryParamMap.pipe(map((q) => q.get('paso'))), { initialValue: null });
  protected readonly step = computed<Step>(() => {
    const raw = this.pasoParam();
    // Enlaces de antes de juntar los pasos: Firma vive en Solución y Evaluación en Construir
    const p = (raw === 'firma' ? 'solucion' : raw === 'evaluacion' ? 'construir' : raw) as Step | null;
    return !this.isNew() && p && STEPS.some((s) => s.key === p) ? p : 'datos';
  });
  protected readonly stepNumber = computed(() => STEPS.findIndex((s) => s.key === this.step()) + 1);
  protected readonly stepLabel = computed(() => STEPS.find((s) => s.key === this.step())!.label);
  // Lo reporta el bloque de casos; null mientras carga
  protected readonly progress = signal<TestsetProgress | null>(null);
  // Pasos que la advertencia del paso actual marca como afectados
  protected readonly affected = signal<TestsetStep[]>([]);
  protected readonly stepItems = computed<StepperItem[]>(() => {
    const isNew = this.isNew();
    const pr = this.progress();
    return STEPS.map((s) => ({
      key: s.key,
      label: s.label,
      done: s.key === 'datos' ? !isNew : !!pr?.[s.key],
      disabled: isNew && s.key !== 'datos',
      warn: s.key !== 'datos' && this.affected().includes(s.key),
    }));
  });

  protected readonly categories = computed(() => this.ctx.edition()?.categories ?? []);
  protected readonly noCategories = computed(() => this.isNew() && this.categories().length === 0);

  protected readonly detail = signal<IProblemDetail | null>(null);
  protected readonly view = signal<'editar' | 'vista'>('editar');
  protected readonly viewOptions = [
    { value: 'editar', label: 'Editar' },
    { value: 'vista', label: 'Vista previa' },
  ];

  protected readonly saving = signal(false);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly preview = signal<IProblemPreview | null>(null);
  protected readonly previewLoading = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    categoryId: [null as number | null, [withMessage(Validators.required, 'Elige una categoría.')]],
    title: ['', [Validators.required, Validators.maxLength(255)]],
    statement: ['', [Validators.required]],
    points: [1, [Validators.required, Validators.min(0), Validators.max(100000)]],
  });

  protected readonly title = computed(() => {
    if (this.isNew()) return 'Nuevo problema';
    const d = this.detail();
    return d ? (d.letter ? `${d.letter} · ${d.title}` : d.title) : '';
  });

  // Problema de otro juez: solo lectura (el autor, un admin de la edición o un superadmin lo editan)
  protected readonly canEdit = computed(() => this.isNew() || (this.detail()?.canEdit ?? false));

  protected readonly published = computed(() => this.detail()?.status === ProblemStatus.PUBLISHED);
  protected readonly isDraft = computed(() => this.detail()?.status === ProblemStatus.DRAFT);
  // Qué entra al concurso lo decide el admin de la edición (o superadmin), y solo antes de iniciarlo
  protected readonly canDecide = computed(() => {
    const status = this.ctx.edition()?.status;
    const admin = this.auth.isSuperadmin() || this.auth.roleInEdition(this.editionId) === StaffRole.ADMIN;
    return admin && (status === EditionStatus.DRAFT || status === EditionStatus.SCHEDULED);
  });

  // Testset vigente del problema (el que apunta currentTestsetId) y si ya está construido (READY).
  protected readonly currentTestset = computed(() => {
    const d = this.detail();
    const id = d?.currentTestsetId ?? null;
    return id != null ? (d!.testsets.find((t) => t.id === id) ?? null) : null;
  });
  protected readonly hasCases = computed(() => this.currentTestset()?.status === TestsetStatus.READY);

  // Se intentó proponer o aceptar sin casos construidos: muestra el aviso ámbar.
  protected readonly publishBlocked = signal(false);

  private readonly deleteDialog = viewChild.required<ConfirmDialog>('deleteDialog');
  private readonly modeDialog = viewChild.required<ConfirmDialog>('modeDialog');

  // ─── Enunciado: markdown o PDF (excluyentes) ───
  // El PDF es el formato principal; markdown queda como alternativa
  protected readonly stmtMode = signal<'markdown' | 'pdf'>('pdf');
  private pendingMode: 'markdown' | 'pdf' | null = null;
  // PDF elegido que se sube al guardar
  protected readonly pdfFile = signal<File | null>(null);
  protected readonly hasPdf = computed(() => this.detail()?.hasStatementPdf ?? false);
  protected readonly previewPdfUrl = signal<SafeResourceUrl | null>(null);
  private previewPdfRaw: string | null = null;

  onStmtMode(mode: 'markdown' | 'pdf'): void {
    if (mode === this.stmtMode()) return;
    const hasContent = mode === 'pdf' ? !!this.form.controls.statement.value.trim() : !!this.pdfFile() || this.hasPdf();
    this.pendingMode = mode;
    if (hasContent) this.modeDialog().open();
    else this.applyStmtMode();
  }

  applyStmtMode(): void {
    const mode = this.pendingMode;
    if (!mode) return;
    this.pendingMode = null;
    this.setStmtMode(mode);
    if (mode === 'pdf') this.form.controls.statement.setValue('');
    else this.pdfFile.set(null);
    this.form.markAsDirty();
    this.bus.dirty.set(true);
  }

  private setStmtMode(mode: 'markdown' | 'pdf'): void {
    this.stmtMode.set(mode);
    const statement = this.form.controls.statement;
    statement.setValidators(mode === 'markdown' ? [Validators.required] : []);
    statement.updateValueAndValidity({ emitEvent: false });
  }

  onPdfFile(file: File): void {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      this.actionError.set('El enunciado debe ser un archivo PDF.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.actionError.set('El PDF pesa más de 10 MB.');
      return;
    }
    this.actionError.set(null);
    this.pdfFile.set(file);
    this.bus.dirty.set(true);
  }

  // Sube el PDF elegido (si hay) después de crear o guardar el problema
  private uploadPdf(id: number): Observable<unknown> {
    const file = this.pdfFile();
    return file && this.stmtMode() === 'pdf' ? this.service.uploadStatementPdf(id, file) : of(null);
  }

  private clearPreviewPdf(): void {
    if (this.previewPdfRaw) URL.revokeObjectURL(this.previewPdfRaw);
    this.previewPdfRaw = null;
    this.previewPdfUrl.set(null);
  }

  // Markdown saneado igual que lo ve el concursante, listo para [innerHTML].
  renderMd(md: string | null | undefined): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(md));
  }

  // Los ejemplos llegan como JSON; se muestran un parámetro por línea
  caseInput(json: string): string {
    return formatCaseInput(json);
  }

  signatureText(sig: IProblemSignature): string {
    return signatureToString(sig);
  }

  constructor() {
    // Reacciona al cambio de problema seleccionado (el componente se reutiliza).
    effect(() => {
      const id = this.param();
      this.resetFor(id);
    });

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.bus.dirty.set(this.form.dirty);
      // Borrador de Datos: si sales sin guardar, al volver se recupera
      if (this.form.dirty) saveDraft(this.datosKey(), this.form.getRawValue());
    });
  }

  // Llave del borrador de Datos: por problema, o por edición si es nuevo
  private datosKey(): string {
    return this.isNew() ? `datos:nuevo:${this.editionId}` : `datos:${this.param()}`;
  }

  protected readonly datosRestored = signal(false);

  private restoreDatosDraft(): void {
    const draft = loadDraft<ReturnType<typeof this.form.getRawValue>>(this.datosKey());
    this.datosRestored.set(false);
    if (!draft || this.form.disabled) return;
    this.form.patchValue({ title: draft.title, statement: draft.statement, ...(this.isNew() && { categoryId: draft.categoryId, points: draft.points }) });
    if (draft.statement?.trim()) this.setStmtMode('markdown');
    this.form.markAsDirty();
    this.bus.dirty.set(true);
    this.datosRestored.set(true);
  }

  discardDatosDraft(): void {
    clearDraft(this.datosKey());
    this.resetFor(this.param());
  }

  private resetFor(id: string | null): void {
    this.view.set('editar');
    this.pdfFile.set(null);
    this.clearPreviewPdf();
    this.progress.set(null);
    this.affected.set([]);
    this.preview.set(null);
    this.actionError.set(null);
    this.publishBlocked.set(false);
    this.loadError.set(false);
    this.notFound.set(false);
    this.loading.set(false);

    if (id === 'nuevo') {
      this.detail.set(null);
      this.form.reset({
        categoryId: this.categories()[0]?.id ?? null,
        title: '',
        statement: '',
        points: 1,
      });
      this.form.get('categoryId')?.enable();
      this.form.get('points')?.enable();
      this.setStmtMode('pdf');
      this.bus.dirty.set(false);
      this.restoreDatosDraft();
      return;
    }

    const numId = Number(id);
    this.loading.set(true);
    this.service.get(numId).subscribe({
      next: (d) => {
        if (this.param() !== id) return; // ya se eligió otro problema
        this.loading.set(false);
        this.detail.set(d);
        // Problemas con enunciado en markdown siguen en markdown; los demás, en PDF
        this.setStmtMode(d.statement.trim() && !d.hasStatementPdf ? 'markdown' : 'pdf');
        this.form.reset({
          categoryId: d.categoryId,
          title: d.title,
          statement: d.statement,
          points: d.points,
        });
        // El backend no permite cambiar categoría ni puntos al editar; sin permiso no se edita nada.
        if (d.canEdit) {
          this.form.enable();
          this.form.get('categoryId')?.disable();
          this.form.get('points')?.disable();
        } else {
          this.form.disable();
        }
        this.bus.dirty.set(false);
        this.restoreDatosDraft();
        this.loadProgress(d, id);
      },
      error: (err) => {
        this.loading.set(false);
        err?.status === 404 ? this.notFound.set(true) : this.loadError.set(true);
      },
    });
  }

  // En Datos no se monta el bloque de casos (que es quien reporta el avance): la barra lo calcula aquí.
  private loadProgress(d: IProblemDetail, id: string | null): void {
    const testsetId = defaultTestsetId(d);
    if (testsetId == null) {
      this.progress.set(testsetProgress(d, null));
      return;
    }
    this.testsets.get(testsetId).subscribe({
      next: (t) => {
        if (this.param() === id && !this.progress()) this.progress.set(testsetProgress(d, t));
      },
      error: () => {}, // sin avance la barra solo marca Datos; el error real se ve al abrir el paso
    });
  }

  onView(value: string): void {
    this.view.set(value as 'editar' | 'vista');
    if (value === 'vista' && !this.isNew()) this.loadPreview();
  }

  // "Cancelar" en modo nuevo: vuelve a la lista sin crear nada.
  cancel(): void {
    clearDraft(this.datosKey());
    this.bus.dirty.set(false);
    this.router.navigate(['..'], { relativeTo: this.route });
  }

  private loadPreview(): void {
    const id = this.detail()?.id;
    if (!id) return;
    this.previewLoading.set(true);
    this.service.preview(id).subscribe({
      next: (p) => {
        this.preview.set(p);
        this.previewLoading.set(false);
        if (p.hasStatementPdf && !this.previewPdfRaw) {
          this.service.statementPdf(id).subscribe({
            next: (blob) => {
              this.clearPreviewPdf();
              this.previewPdfRaw = URL.createObjectURL(blob);
              this.previewPdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.previewPdfRaw));
            },
            error: (err) => this.actionError.set(message(err, 'No se pudo cargar el PDF del enunciado.')),
          });
        }
      },
      error: () => this.previewLoading.set(false),
    });
  }

  goTo(step: Step): void {
    // Datos no tiene advertencia; la de otro paso la vuelve a mandar el bloque de casos al llegar
    this.affected.set([]);
    this.router.navigate([], { relativeTo: this.route, queryParams: { paso: step }, replaceUrl: true });
  }

  goNext(): void {
    const next = STEPS[this.stepNumber()];
    if (next) this.goTo(next.key);
  }

  goPrev(): void {
    const prev = STEPS[this.stepNumber() - 2];
    if (prev) this.goTo(prev.key);
  }

  // andNext: "Guardar y seguir" (sin cambios, solo avanza)
  save(andNext = false): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.stmtMode() === 'pdf' && !this.pdfFile() && !this.hasPdf()) {
      this.actionError.set('Sube el PDF del enunciado o cambia a markdown.');
      return;
    }
    if (andNext && !this.isNew() && this.form.pristine && !this.pdfFile()) {
      this.goNext();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.actionError.set(null);

    if (this.isNew()) {
      this.service
        .create(this.editionId, {
          categoryId: v.categoryId!,
          title: v.title,
          statement: this.stmtMode() === 'markdown' ? v.statement : '',
          points: v.points,
        })
        .pipe(
          // Si falla el PDF el problema ya existe: se abre igual y el aviso pide volver a subirlo
          switchMap((res) => this.uploadPdf(res.id).pipe(map(() => res), catchError(() => of({ ...res, pdfFailed: true })))),
        )
        .subscribe({
          next: (res) => {
            this.saving.set(false);
            clearDraft(this.datosKey());
            this.pdfFile.set(null);
            this.bus.dirty.set(false);
            this.bus.load();
            // Creado el problema, sigue en su página con el paso que va después de Datos
            const pdfFailed = 'pdfFailed' in res;
            this.router.navigate(['..', res.id], { relativeTo: this.route, queryParams: { paso: pdfFailed ? 'datos' : STEPS[1].key } });
            if (pdfFailed) setTimeout(() => this.actionError.set('El problema se creó, pero no se pudo subir el PDF. Vuelve a subirlo.'));
          },
          error: (err) => {
            this.saving.set(false);
            this.actionError.set(message(err, 'No se pudo crear el problema.'));
          },
        });
      return;
    }

    const id = this.detail()!.id;
    this.service
      .update(id, {
        title: v.title,
        // En modo markdown, guardarlo quita el PDF en el backend
        ...(this.stmtMode() === 'markdown' && { statement: v.statement }),
      })
      .pipe(switchMap(() => this.uploadPdf(id)))
      .subscribe({
        next: () => {
          this.saving.set(false);
          clearDraft(this.datosKey());
          this.datosRestored.set(false);
          this.pdfFile.set(null);
          this.clearPreviewPdf();
          this.form.markAsPristine();
          this.bus.dirty.set(false);
          this.bus.load();
          this.refreshDetail();
          if (andNext) this.goNext();
        },
        error: (err) => {
          this.saving.set(false);
          this.actionError.set(message(err, 'No se pudo guardar.'));
        },
      });
  }

  // propose: el autor; accept/disable: el admin de la edición o superadmin, antes de iniciar
  decide(action: 'propose' | 'accept' | 'disable'): void {
    if (action !== 'disable' && !this.hasCases()) {
      this.publishBlocked.set(true);
      return;
    }
    const id = this.detail()?.id;
    if (!id) return;
    this.actionError.set(null);
    this.service[action](id).subscribe({
      next: () => {
        this.bus.load();
        this.refreshDetail();
      },
      error: (err) => this.actionError.set(message(err, DECIDE_ERROR[action])),
    });
  }

  // Recarga el problema sin tocar el formulario (p. ej. cuando los casos de prueba cambian).
  refreshDetail(): void {
    const id = this.detail()?.id;
    if (!id) return;
    this.service.get(id).subscribe({
      next: (d) => {
        if (this.detail()?.id === id) this.detail.set(d);
      },
      error: (err) => this.actionError.set(message(err, 'No se pudo recargar el problema.')),
    });
  }

  askDelete(): void {
    this.deleteDialog().open();
  }

  remove(): void {
    const id = this.detail()?.id;
    if (!id) return;
    this.service.remove(id).subscribe({
      next: () => {
        this.bus.dirty.set(false);
        this.bus.load();
        this.router.navigate(['..'], { relativeTo: this.route });
      },
      error: (err) => this.actionError.set(message(err, 'No se pudo eliminar.')),
    });
  }

  categoryName(id: number | null): string {
    return this.categories().find((c) => c.id === id)?.name ?? '';
  }
}

type Step = 'datos' | TestsetStep;
const STEPS: { key: Step; label: string }[] = [
  { key: 'datos', label: 'Datos' },
  { key: 'solucion', label: 'Solución y firma' },
  { key: 'casos', label: 'Casos' },
  { key: 'construir', label: 'Evaluación y proponer' },
];

function findEditionId(route: ActivatedRoute): number {
  const param = route.pathFromRoot.map((r) => r.snapshot.paramMap.get('id')).find((v) => v != null);
  return Number(param);
}

function message(err: unknown, fallback: string): string {
  return backendMessage(err, fallback);
}

const DECIDE_ERROR = {
  propose: 'No se pudo proponer el problema.',
  accept: 'No se pudo aceptar el problema.',
  disable: 'No se pudo quitar el problema del concurso.',
} as const;

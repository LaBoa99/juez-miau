import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  CompareMode,
  IProblemDetail,
  IProblemPreview,
  IProblemSignature,
  IProblemTestset,
  ProblemStatus,
  ScalarType,
  TestsetStatus,
} from '@concurso/shared-types';
import { MAX_ARRAY_DEPTH, SCALAR_TYPES, signatureToString, typeToUi, uiToType } from '../../../../shared/type-ref';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Segmented } from '../../../../shared/ui/segmented.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { ProblemsService } from '../../data/problems.service';
import { ProblemsBus } from '../../data/problems-bus';
import { EditionContext } from '../../../editions/pages/edition-layout/edition-context';

@Component({
  selector: 'oj-problem-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ButtonDirective, Badge, Alert, FormField, Segmented, EmptyState, ConfirmDialog],
  templateUrl: './problem-panel.html',
  styleUrl: './problem-panel.css',
})
export class ProblemPanel {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(ProblemsService);
  private readonly bus = inject(ProblemsBus);
  private readonly ctx = inject(EditionContext);
  private readonly fb = inject(FormBuilder);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly editionId = findEditionId(this.route);
  // La ruta 'nuevo' no lleva :problemId; leemos el último segmento de ESTA ruta
  // ('nuevo' o el id) para no pedir al backend un problema inexistente en modo nuevo.
  private readonly param = toSignal(this.route.url.pipe(map((segs) => segs.at(-1)?.path ?? null)), {
    initialValue: this.route.snapshot.url.at(-1)?.path ?? null,
  });
  protected readonly isNew = computed(() => this.param() === 'nuevo');

  protected readonly categories = computed(() => this.ctx.edition()?.categories ?? []);
  protected readonly noCategories = computed(() => this.isNew() && this.categories().length === 0);

  protected readonly detail = signal<IProblemDetail | null>(null);
  protected readonly view = signal<'editar' | 'vista'>('editar');
  protected readonly viewOptions = [
    { value: 'editar', label: 'Editar' },
    { value: 'vista', label: 'Vista previa' },
  ];

  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);
  protected readonly publishErrors = signal<string[]>([]);
  protected readonly actionError = signal<string | null>(null);

  protected readonly preview = signal<IProblemPreview | null>(null);
  protected readonly previewLoading = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    categoryId: [null as number | null, [Validators.required]],
    letter: ['', [Validators.required, Validators.pattern(/^[A-Z]{1,2}$/)]],
    title: ['', [Validators.required, Validators.maxLength(255)]],
    statement: ['', [Validators.required]],
    inputFormat: ['', [Validators.required]],
    outputFormat: ['', [Validators.required]],
    points: [1, [Validators.required, Validators.min(0), Validators.max(100000)]],
  });

  // ─── Firma de la función ───
  protected readonly scalarTypes = SCALAR_TYPES;
  protected readonly depths = Array.from({ length: MAX_ARRAY_DEPTH + 1 }, (_, i) => i);
  protected readonly signatureSaving = signal(false);
  protected readonly signatureError = signal<string | null>(null);
  protected readonly signatureForm = this.fb.group({
    functionName: ['', [Validators.required]],
    params: this.fb.array<FormGroup>([]),
    returnBase: ['int' as ScalarType],
    returnDepth: [0],
  });
  // La firma solo cambia con el problema en DRAFT y su testset vigente editable (DRAFT/FAILED).
  protected readonly signatureEditable = computed(() => {
    const d = this.detail();
    if (!d || d.status !== ProblemStatus.DRAFT) return false;
    const t = this.currentTestset();
    return !t || t.status === TestsetStatus.DRAFT || t.status === TestsetStatus.FAILED;
  });
  protected readonly signaturePreview = computed(() => {
    const s = this.detail()?.signature;
    return s ? signatureToString(s) : null;
  });

  private readonly deleteDialog = viewChild.required(ConfirmDialog);

  protected readonly title = computed(() => {
    if (this.isNew()) return 'Nuevo problema';
    const d = this.detail();
    return d ? `${d.letter} · ${d.title}` : '';
  });

  protected readonly published = computed(() => this.detail()?.status === ProblemStatus.PUBLISHED);
  protected readonly isDraft = computed(() => this.detail()?.status === ProblemStatus.DRAFT);

  // Testset vigente (para la caja "Casos de prueba").
  protected readonly currentTestset = computed<IProblemTestset | null>(() => {
    const d = this.detail();
    if (!d || d.currentTestsetId === null) return null;
    return d.testsets.find((t) => t.id === d.currentTestsetId) ?? null;
  });

  // Markdown saneado (marked -> DOMPurify) listo para [innerHTML].
  renderMd(md: string | null | undefined): SafeHtml {
    if (!md) return '';
    const html = DOMPurify.sanitize(marked.parse(md, { async: false }) as string);
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  constructor() {
    // Reacciona al cambio de problema seleccionado (el componente se reutiliza).
    effect(() => {
      const id = this.param();
      this.resetFor(id);
    });

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.bus.dirty.set(this.form.dirty));

    // Habilita/deshabilita la firma según el estado del problema/testset.
    effect(() => {
      if (this.signatureEditable()) this.signatureForm.enable({ emitEvent: false });
      else this.signatureForm.disable({ emitEvent: false });
    });
  }

  private resetFor(id: string | null): void {
    this.view.set('editar');
    this.preview.set(null);
    this.publishErrors.set([]);
    this.actionError.set(null);
    this.loadError.set(false);
    this.notFound.set(false);

    if (id === 'nuevo') {
      this.detail.set(null);
      this.form.reset({
        categoryId: this.categories()[0]?.id ?? null,
        letter: '',
        title: '',
        statement: '',
        inputFormat: '',
        outputFormat: '',
        points: 1,
      });
      this.form.get('categoryId')?.enable();
      this.form.get('points')?.enable();
      this.bus.dirty.set(false);
      return;
    }

    const numId = Number(id);
    this.service.get(numId).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.form.reset({
          categoryId: d.categoryId,
          letter: d.letter,
          title: d.title,
          statement: d.statement,
          inputFormat: d.inputFormat,
          outputFormat: d.outputFormat,
          points: d.points,
        });
        // El backend no permite cambiar categoría ni puntos al editar.
        this.form.get('categoryId')?.disable();
        this.form.get('points')?.disable();
        this.populateSignature(d.signature);
        this.bus.dirty.set(false);
      },
      error: (err) => (err?.status === 404 ? this.notFound.set(true) : this.loadError.set(true)),
    });
  }

  // ─── Firma ───
  get sigParams(): FormArray<FormGroup> {
    return this.signatureForm.get('params') as FormArray<FormGroup>;
  }

  private paramGroup(name = '', base: ScalarType = 'int', depth = 0): FormGroup {
    return this.fb.group({ name: [name, [Validators.required]], base: [base], depth: [depth] });
  }

  private populateSignature(sig: IProblemSignature | null): void {
    this.signatureError.set(null);
    this.sigParams.clear();
    if (sig) {
      const ret = typeToUi(sig.returns);
      this.signatureForm.patchValue({ functionName: sig.functionName, returnBase: ret.base, returnDepth: ret.depth });
      for (const p of sig.params) {
        const ui = typeToUi(p.type);
        this.sigParams.push(this.paramGroup(p.name, ui.base, ui.depth));
      }
    } else {
      this.signatureForm.patchValue({ functionName: '', returnBase: 'int', returnDepth: 0 });
    }
  }

  addParam(): void {
    this.sigParams.push(this.paramGroup());
  }

  removeParam(i: number): void {
    this.sigParams.removeAt(i);
  }

  saveSignature(): void {
    if (this.signatureForm.invalid) {
      this.signatureForm.markAllAsTouched();
      return;
    }
    const id = this.detail()?.id;
    if (!id) return;
    const raw = this.signatureForm.getRawValue();
    const sig: IProblemSignature = {
      functionName: raw.functionName!,
      params: (raw.params as { name: string; base: ScalarType; depth: number }[]).map((p) => ({
        name: p.name,
        type: uiToType(p.base, p.depth),
      })),
      returns: uiToType(raw.returnBase as ScalarType, raw.returnDepth as number),
    };
    this.signatureSaving.set(true);
    this.signatureError.set(null);
    this.service.updateSignature(id, sig).subscribe({
      next: () => {
        this.signatureSaving.set(false);
        this.resetFor(String(id));
      },
      error: (err) => {
        this.signatureSaving.set(false);
        this.signatureError.set(message(err, 'No se pudo guardar la firma.'));
      },
    });
  }

  onView(value: string): void {
    this.view.set(value as 'editar' | 'vista');
    if (value === 'vista' && !this.isNew()) this.loadPreview();
  }

  private loadPreview(): void {
    const id = this.detail()?.id;
    if (!id) return;
    this.previewLoading.set(true);
    this.service.preview(id).subscribe({
      next: (p) => {
        this.preview.set(p);
        this.previewLoading.set(false);
      },
      error: () => this.previewLoading.set(false),
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.actionError.set(null);

    if (this.isNew()) {
      this.service
        .create(this.editionId, {
          categoryId: v.categoryId!,
          letter: v.letter,
          title: v.title,
          statement: v.statement,
          inputFormat: v.inputFormat,
          outputFormat: v.outputFormat,
          points: v.points,
        })
        .subscribe({
          next: (res) => {
            this.saving.set(false);
            this.bus.dirty.set(false);
            this.bus.load();
            this.router.navigate(['..', res.id], { relativeTo: this.route });
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
        letter: v.letter,
        title: v.title,
        statement: v.statement,
        inputFormat: v.inputFormat,
        outputFormat: v.outputFormat,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.form.markAsPristine();
          this.bus.dirty.set(false);
          this.bus.load();
          this.resetFor(String(id));
        },
        error: (err) => {
          this.saving.set(false);
          this.actionError.set(message(err, 'No se pudo guardar.'));
        },
      });
  }

  publish(): void {
    const id = this.detail()?.id;
    if (!id) return;
    this.publishing.set(true);
    this.publishErrors.set([]);
    this.actionError.set(null);
    this.service.publish(id).subscribe({
      next: () => {
        this.publishing.set(false);
        this.bus.load();
        this.resetFor(String(id));
      },
      error: (err) => {
        this.publishing.set(false);
        const errs = err?.error?.errors;
        if (Array.isArray(errs)) this.publishErrors.set(errs);
        else this.actionError.set(message(err, 'No se pudo publicar.'));
      },
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

  testsetTone(status: TestsetStatus): 'success' | 'warning' | 'danger' | 'neutral' {
    switch (status) {
      case TestsetStatus.READY:
        return 'success';
      case TestsetStatus.BUILDING:
        return 'warning';
      case TestsetStatus.FAILED:
        return 'danger';
      default:
        return 'neutral';
    }
  }

  compareLabel(mode: CompareMode): string {
    return { exact: 'Exacto', tolerance: 'Tolerancia', checker: 'Checker' }[mode] ?? mode;
  }

  categoryName(id: number | null): string {
    return this.categories().find((c) => c.id === id)?.name ?? '';
  }
}

function findEditionId(route: ActivatedRoute): number {
  const param = route.pathFromRoot.map((r) => r.snapshot.paramMap.get('id')).find((v) => v != null);
  return Number(param);
}

function message(err: unknown, fallback: string): string {
  const m = (err as { error?: { message?: unknown } })?.error?.message;
  if (Array.isArray(m)) return m.join(', ');
  return typeof m === 'string' ? m : fallback;
}

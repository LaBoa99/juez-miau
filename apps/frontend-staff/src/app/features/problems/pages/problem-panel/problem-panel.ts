import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { IProblemDetail, IProblemPreview, ProblemStatus, TestsetStatus } from '@concurso/shared-types';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Segmented } from '../../../../shared/ui/segmented.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { TestsetStatusPipe } from '../../../../shared/pipes/testset-status.pipe';
import { ProblemsService } from '../../data/problems.service';
import { ProblemsBus } from '../../data/problems-bus';
import { EditionContext } from '../../../editions/pages/edition-layout/edition-context';
import { backendMessage } from '../../../../core/http/backend-error.mapper';

@Component({
  selector: 'oj-problem-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ButtonDirective, Badge, Alert, FormField, Segmented, EmptyState, ConfirmDialog, TestsetStatusPipe],
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
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);
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

  protected readonly title = computed(() => {
    if (this.isNew()) return 'Nuevo problema';
    const d = this.detail();
    return d ? `${d.letter} · ${d.title}` : '';
  });

  protected readonly published = computed(() => this.detail()?.status === ProblemStatus.PUBLISHED);
  protected readonly isDraft = computed(() => this.detail()?.status === ProblemStatus.DRAFT);

  // Testset vigente del problema (el que apunta currentTestsetId) y si ya está construido (READY).
  protected readonly currentTestset = computed(() => {
    const d = this.detail();
    const id = d?.currentTestsetId ?? null;
    return id != null ? (d!.testsets.find((t) => t.id === id) ?? null) : null;
  });
  protected readonly hasCases = computed(() => this.currentTestset()?.status === TestsetStatus.READY);

  // Se intentó publicar sin casos construidos: muestra el aviso ámbar.
  protected readonly publishBlocked = signal(false);

  private readonly deleteDialog = viewChild.required(ConfirmDialog);

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
  }

  private resetFor(id: string | null): void {
    this.view.set('editar');
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
    this.loading.set(true);
    this.service.get(numId).subscribe({
      next: (d) => {
        this.loading.set(false);
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
        this.bus.dirty.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        err?.status === 404 ? this.notFound.set(true) : this.loadError.set(true);
      },
    });
  }

  onView(value: string): void {
    this.view.set(value as 'editar' | 'vista');
    if (value === 'vista' && !this.isNew()) this.loadPreview();
  }

  // La letra se guarda en mayúscula (el backend valida /^[A-Z]{1,2}$/).
  upperLetter(e: Event): void {
    const el = e.target as HTMLInputElement;
    const up = el.value.toUpperCase();
    if (up !== el.value) this.form.get('letter')!.setValue(up);
  }

  // "Cancelar" en modo nuevo: vuelve a la lista sin crear nada.
  cancel(): void {
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
            // Guardado el problema nuevo, navegamos a su edición: ahí aparece "Crear casos de prueba".
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
    if (!this.hasCases()) {
      this.publishBlocked.set(true);
      return;
    }
    const id = this.detail()?.id;
    if (!id) return;
    this.actionError.set(null);
    this.service.publish(id).subscribe({
      next: () => {
        this.bus.load();
        this.resetFor(String(id));
      },
      error: (err) => this.actionError.set(message(err, 'No se pudo publicar.')),
    });
  }

  goToCases(): void {
    const id = this.detail()?.id;
    if (id) this.router.navigate(['/ediciones', this.editionId, 'problemas', id, 'casos']);
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

function findEditionId(route: ActivatedRoute): number {
  const param = route.pathFromRoot.map((r) => r.snapshot.paramMap.get('id')).find((v) => v != null);
  return Number(param);
}

function message(err: unknown, fallback: string): string {
  return backendMessage(err, fallback);
}

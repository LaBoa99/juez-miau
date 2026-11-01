import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IStaffSubmission, SubmissionStatus, Verdict } from '@concurso/shared-types';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { SubmissionsService } from '../../../submissions/data/submissions.service';
import { EditionContext } from './edition-context';

@Component({
  selector: 'oj-edition-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  providers: [EditionContext],
  templateUrl: './edition-layout.html',
  styleUrl: './edition-layout.css',
})
export class EditionLayout {
  private readonly route = inject(ActivatedRoute);
  private readonly submissions = inject(SubmissionsService);
  private readonly rt = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly ctx = inject(EditionContext);

  protected readonly id = Number(this.route.snapshot.paramMap.get('id'));

  // Contador de revisión: ids PENDING_REVIEW, sembrados por HTTP y mantenidos con los eventos del
  // socket (un envío entra al quedar PENDING_REVIEW y sale al resolverlo un juez).
  private readonly pending = signal<ReadonlySet<number>>(new Set());
  protected readonly reviewCount = computed(() => this.pending().size);
  // El backend no tiene "código" de edición: se muestra el nombre.
  protected readonly code = computed(() => this.ctx.edition()?.name ?? '');

  protected readonly sections = [
    { label: 'Configuración', path: 'configuracion' },
    { label: 'Equipos', path: 'equipos' },
    { label: 'Problemas', path: 'problemas' },
    { label: 'Concurso', path: 'concurso' },
    { label: 'Envíos', path: 'envios' },
    { label: 'Marcador', path: 'marcador' },
    { label: 'Revisión', path: 'revision' },
    { label: 'Alertas', path: 'alertas' },
  ];

  constructor() {
    this.ctx.load(this.id);

    this.submissions.reviewQueue(this.id).subscribe({
      next: (rows) => this.pending.set(new Set(rows.map((r) => r.id))),
      error: () => {},
    });

    this.rt.joinEdition(this.id);
    this.rt.onSubmission().pipe(takeUntilDestroyed()).subscribe((s) => this.track(s as IStaffSubmission));
    this.destroyRef.onDestroy(() => this.rt.leave(this.id));
  }

  private track(s: IStaffSubmission): void {
    const inReview = s.status === SubmissionStatus.DONE && s.verdict === Verdict.PENDING_REVIEW;
    const set = this.pending();
    if (inReview === set.has(s.id)) return;
    const next = new Set(set);
    inReview ? next.add(s.id) : next.delete(s.id);
    this.pending.set(next);
  }
}

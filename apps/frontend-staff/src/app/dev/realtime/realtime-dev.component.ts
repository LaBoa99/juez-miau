import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { RealtimeService } from '../../core/realtime/realtime.service';

interface LogEntry {
  event: string;
  at: Date;
  detail: string;
}

// Página solo de desarrollo (fuera del shell) para probar el socket: /dev/realtime
@Component({
  selector: 'oj-realtime-dev',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ButtonDirective],
  template: `
    <h1>Realtime (dev)</h1>
    <p>
      Estado:
      <span class="rt__state oj-mono">{{ rt.connectionState() }}</span>
    </p>

    <div class="rt__controls">
      <label for="rt-ed">Edición</label>
      <input id="rt-ed" class="oj-mono" type="number" min="1" [value]="editionId()" (input)="editionId.set(+$any($event.target).value)" />
      <button ojButton variant="primary" type="button" (click)="joinStaff()">Unirse como staff</button>
      <button ojButton variant="secondary" type="button" (click)="joinPublic()">Unirse como público</button>
    </div>

    <h2>Últimos 20 eventos</h2>
    @if (events().length === 0) {
      <p class="rt__muted">Sin eventos todavía.</p>
    } @else {
      <ul class="rt__log">
        @for (e of events(); track $index) {
          <li>
            <span class="rt__time oj-mono">{{ e.at | date: 'HH:mm:ss' }}</span>
            <span class="rt__event oj-mono">{{ e.event }}</span>
            <span class="rt__detail oj-mono">{{ e.detail }}</span>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; max-width: 760px; margin: 0 auto; padding: 24px; }
    .rt__controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 16px 0; }
    .rt__controls input { width: 100px; }
    .rt__state { font-weight: 600; }
    .rt__log { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .rt__log li { display: flex; gap: 12px; font-size: 12px; border-bottom: 1px solid var(--oj-border); padding: 4px 0; }
    .rt__time { color: var(--oj-text-muted); }
    .rt__event { font-weight: 600; }
    .rt__detail { color: var(--oj-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rt__muted { color: var(--oj-text-muted); font-size: 13px; }
  `,
})
export class RealtimeDev {
  protected readonly rt = inject(RealtimeService);
  protected readonly editionId = signal(1);
  protected readonly events = signal<LogEntry[]>([]);

  constructor() {
    this.rt.onClock().pipe(takeUntilDestroyed()).subscribe((p) => this.push('clock:update', p));
    this.rt.onStandings().pipe(takeUntilDestroyed()).subscribe((p) => this.push('standings:update', { view: p.view, frozen: p.frozen }));
    this.rt.onSubmission().pipe(takeUntilDestroyed()).subscribe((p) => this.push('submission:update', p));
    this.rt.onSubmissionProgress().pipe(takeUntilDestroyed()).subscribe((p) => this.push('submission:progress', p));
    this.rt.onFlag().pipe(takeUntilDestroyed()).subscribe((p) => this.push('flag:update', p));
  }

  joinStaff(): void {
    this.rt.joinEdition(this.editionId());
  }

  joinPublic(): void {
    this.rt.joinPublic(this.editionId());
  }

  private push(event: string, payload: unknown): void {
    const entry: LogEntry = { event, at: new Date(), detail: JSON.stringify(payload).slice(0, 120) };
    this.events.update((list) => [entry, ...list].slice(0, 20));
  }
}

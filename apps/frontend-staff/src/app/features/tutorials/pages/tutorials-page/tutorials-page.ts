import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../../core/auth/auth.service';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { Tutorial, tutorialsFor } from '../../tutorials.data';

// Tutoriales en video. Cada usuario solo ve los de lo que puede hacer con sus roles.
@Component({
  selector: 'oj-tutorials-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, EmptyState],
  templateUrl: './tutorials-page.html',
  styleUrl: './tutorials-page.css',
})
export class TutorialsPage {
  private readonly auth = inject(AuthService);

  protected readonly tutorials = computed(() =>
    tutorialsFor(this.auth.isSuperadmin(), this.auth.editionRoles().values()),
  );
  protected readonly groups = computed(() => {
    const byGroup = new Map<string, Tutorial[]>();
    for (const t of this.tutorials()) byGroup.set(t.group, [...(byGroup.get(t.group) ?? []), t]);
    return [...byGroup].map(([name, items]) => ({ name, items }));
  });

  private readonly picked = signal<string | null>(null);
  protected readonly current = computed(
    () => this.tutorials().find((t) => t.id === this.picked()) ?? this.tutorials()[0] ?? null,
  );

  protected pick(t: Tutorial): void {
    this.picked.set(t.id);
  }
}

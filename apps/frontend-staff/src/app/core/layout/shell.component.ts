import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterOutlet,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { Header } from './header.component';
import { Breadcrumb } from '../../shared/ui/breadcrumb.component';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'oj-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Header, Breadcrumb],
  template: `
    <oj-header [userName]="auth.user()?.name ?? 'Usuario'" (logout)="auth.logout()" />
    <div class="oj-sh__crumbs">
      <oj-breadcrumb [items]="crumbs()" />
    </div>
    <main class="oj-sh__main">
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: block;
    }
    .oj-sh__crumbs {
      background: var(--oj-bg-muted);
      border-bottom: 1px solid var(--oj-border);
      padding: 10px 24px;
    }
    .oj-sh__main {
      display: block;
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px;
    }
  `,
})
export class Shell {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly auth = inject(AuthService);

  protected readonly crumbs = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => this.buildCrumbs()),
    ),
    { initialValue: [] as { label: string; link: string }[] },
  );

  private buildCrumbs() {
    const crumbs: { label: string; link: string }[] = [];
    let node: ActivatedRouteSnapshot | null = this.route.root.snapshot;
    let url = '';
    while (node) {
      const seg = node.url.map((s) => s.path).join('/');
      if (seg) url += '/' + seg;
      const label = node.data['breadcrumb'] as string | undefined;
      if (label) crumbs.push({ label, link: url });
      node = node.firstChild;
    }
    return crumbs;
  }
}

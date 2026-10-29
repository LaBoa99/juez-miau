import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { Badge } from '../../shared/ui/badge.component';
import { Alert } from '../../shared/ui/alert.component';
import { FormField } from '../../shared/ui/form-field.component';
import { Segmented } from '../../shared/ui/segmented.component';
import { PageHeader } from '../../shared/ui/page-header.component';
import { Breadcrumb } from '../../shared/ui/breadcrumb.component';
import { EmptyState } from '../../shared/ui/empty-state.component';
import { SidePanel } from '../../shared/ui/side-panel.component';
import { TabNav } from '../../shared/ui/tab-nav.component';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.component';
import { FileDrop } from '../../shared/ui/file-drop.component';

@Component({
  selector: 'oj-ui-showcase',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonDirective, Badge, Alert, FormField, Segmented, PageHeader, Breadcrumb, EmptyState,
    SidePanel, TabNav, ConfirmDialog, FileDrop,
  ],
  templateUrl: './ui-showcase.html',
  styleUrl: './ui-showcase.css',
})
export class UiShowcase {
  protected readonly lang = signal('cpp');
  protected readonly langOptions = [
    { value: 'cpp', label: 'C++20' },
    { value: 'py', label: 'Python 3.11' },
    { value: 'java', label: 'OpenJDK 21' },
  ];
  protected readonly crumbs = [
    { label: 'Home', link: '/' },
    { label: 'Dev', link: '/dev/ui' },
    { label: 'UI Showcase' },
  ];

  protected readonly panelOpen = signal(true);
  protected readonly tabs = [
    { label: 'Showcase', link: '/dev/ui', count: 16 },
    { label: 'Login', link: '/' },
  ];
  protected readonly lastConfirm = signal('');
  protected readonly picked = signal<File | undefined>(undefined);
}

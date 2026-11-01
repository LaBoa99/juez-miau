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
import { Modal } from '../../shared/ui/modal.component';
import { CodeBlock } from '../../shared/ui/code-block.component';
import { MarkdownEditor } from '../../shared/ui/markdown-editor/markdown-editor.component';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'oj-ui-showcase',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonDirective, Badge, Alert, FormField, Segmented, PageHeader, Breadcrumb, EmptyState,
    SidePanel, TabNav, ConfirmDialog, FileDrop, Modal, CodeBlock, MarkdownEditor, ReactiveFormsModule,
  ],
  templateUrl: './ui-showcase.html',
  styleUrl: './ui-showcase.css',
})
export class UiShowcase {
  protected readonly mdCtrl = new FormControl('Suma **a** y **b**.\n\n- `1 <= a, b <= 100`\n\n| a | b |\n| --- | --- |\n| 2 | 3 |');
  protected readonly lang = signal('cpp');
  protected readonly langOptions = [
    { value: 'cpp', label: 'C++20' },
    { value: 'py', label: 'Python 3.11' },
    { value: 'java', label: 'OpenJDK 21' },
  ];
  protected readonly view = signal('editar');
  protected readonly viewOptions = [
    { value: 'editar', label: 'Editar' },
    { value: 'vista', label: 'Vista previa', disabled: true },
  ];
  protected readonly crumbs = [
    { label: 'Home', link: '/' },
    { label: 'Dev', link: '/dev/ui' },
    { label: 'UI Showcase' },
  ];
  protected readonly sampleCode = `#include <bits/stdc++.h>\nusing namespace std;\n\nint suma(int a, int b) {\n  return a + b;\n}`;

  protected readonly panelOpen = signal(true);
  protected readonly tabs = [
    { label: 'Showcase', link: '/dev/ui', count: 16 },
    { label: 'Login', link: '/' },
  ];
  protected readonly lastConfirm = signal('');
  protected readonly picked = signal<File | undefined>(undefined);
}

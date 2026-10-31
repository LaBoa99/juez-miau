import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

// Bloque de código con números de línea. Solo lectura.
@Component({
  selector: 'oj-code-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="oj-cb">
      <pre class="oj-cb__gutter" aria-hidden="true">{{ gutter() }}</pre>
      <pre class="oj-cb__code">{{ code() }}</pre>
    </div>
  `,
  styles: `
    .oj-cb {
      display: flex;
      border: 1px solid var(--oj-border);
      border-radius: var(--oj-radius);
      background: var(--oj-bg-muted);
      font-family: var(--oj-font-mono);
      font-size: 13px;
      line-height: 20px;
      overflow: hidden;
    }
    .oj-cb__gutter {
      margin: 0;
      padding: var(--oj-space-sm) 10px;
      color: var(--oj-text-muted);
      text-align: right;
      user-select: none;
      white-space: pre;
      border-right: 1px solid var(--oj-border);
    }
    .oj-cb__code {
      margin: 0;
      padding: var(--oj-space-sm) 10px;
      flex: 1;
      min-width: 0;
      overflow-x: auto;
      white-space: pre;
      tab-size: 4;
    }
  `,
})
export class CodeBlock {
  readonly code = input('');

  // Columna de números alineada línea a línea con el código.
  protected readonly gutter = computed(() => {
    const lines = this.code().split('\n').length;
    return Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  });
}

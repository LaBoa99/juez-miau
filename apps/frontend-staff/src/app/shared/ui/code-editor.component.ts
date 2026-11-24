import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { HighlightStyle, StreamLanguage, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { Compartment, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

// Extensión de CodeMirror para el `code` de Language; un lenguaje desconocido queda sin colores
export function languageExtension(code: string | null | undefined): Extension {
  switch (code) {
    case 'python': return python();
    case 'java': return java();
    case 'c':
    case 'cpp': return cpp();
    case 'javascript': return javascript();
    case 'typescript': return javascript({ typescript: true });
    case 'csharp': return StreamLanguage.define(csharp);
    default: return [];
  }
}

// Colores con las variables de tokens.css para que sirvan en el tema claro y en el oscuro
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.modifier, t.moduleKeyword], color: 'var(--oj-ice)', fontWeight: '600' },
  { tag: [t.typeName, t.className, t.standard(t.variableName)], color: 'var(--oj-ice)' },
  { tag: [t.string, t.special(t.string), t.character], color: 'var(--oj-success)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--oj-warning)' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.meta], color: 'var(--oj-text-muted)', fontStyle: 'italic' },
  { tag: t.function(t.definition(t.variableName)), fontWeight: '600' },
  { tag: t.invalid, color: 'var(--oj-danger)' },
]);

const theme = EditorView.theme({
  '&': {
    fontSize: '13px',
    color: 'var(--oj-text)',
    backgroundColor: 'var(--oj-bg)',
    border: '1px solid var(--oj-border-input)',
    borderRadius: 'var(--oj-radius)',
  },
  '&.cm-focused': { outline: '1px solid var(--oj-text)' },
  '.cm-scroller': { fontFamily: 'var(--oj-font-mono)', lineHeight: '1.25rem', maxHeight: '32rem', overflow: 'auto' },
  '.cm-content, .cm-gutter': { minHeight: 'var(--oj-code-min-height)' },
  '.cm-content': { caretColor: 'var(--oj-text)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--oj-text)' },
  '.cm-gutters': {
    backgroundColor: 'var(--oj-bg-muted)',
    color: 'var(--oj-text-muted)',
    borderRight: '1px solid var(--oj-border)',
    borderRadius: 'var(--oj-radius) 0 0 var(--oj-radius)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--oj-bg-muted)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--oj-neutral-bg)', color: 'var(--oj-text)' },
  '.cm-selectionBackground, ::selection': { backgroundColor: 'var(--oj-neutral-bg)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': { backgroundColor: 'var(--oj-ice-bg)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--oj-success-bg)', outline: '1px solid var(--oj-success)' },
  '.cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'var(--oj-danger-bg)' },
  '.cm-placeholder': { color: 'var(--oj-text-muted)' },
  '.cm-panels': { backgroundColor: 'var(--oj-bg-muted)', color: 'var(--oj-text)' },
  '.cm-tooltip': { backgroundColor: 'var(--oj-bg)', border: '1px solid var(--oj-border)', borderRadius: 'var(--oj-radius)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--oj-primary)', color: 'var(--oj-bg)' },
});

// Editor de código (CodeMirror 6): colores según el lenguaje, números de línea, Tab sangra.
// Esc y luego Tab saca el foco del editor (comportamiento propio de CodeMirror).
@Component({
  selector: 'oj-code-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: {
    style: 'display: block',
    '[style.--oj-code-min-height]': 'rows() * 1.25 + "rem"',
  },
})
export class CodeEditor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly value = model('');
  /** `code` del lenguaje (python, java, cpp…). */
  readonly language = input<string | null | undefined>(null);
  readonly inputId = input<string>();
  readonly ariaLabel = input('Código');
  readonly placeholder = input('');
  readonly rows = input(10);

  private readonly view = signal<EditorView | null>(null);
  private readonly lang = new Compartment();

  constructor() {
    afterNextRender(() => {
      const attrs: Record<string, string> = { 'aria-label': this.ariaLabel() };
      const id = this.inputId();
      if (id) attrs['id'] = id;
      const view = new EditorView({
        parent: this.host.nativeElement,
        doc: this.value(),
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          indentUnit.of('    '),
          syntaxHighlighting(highlight),
          theme,
          EditorView.contentAttributes.of(attrs),
          placeholder(this.placeholder()),
          this.lang.of(languageExtension(this.language())),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) this.value.set(u.state.doc.toString());
          }),
        ],
      });
      this.view.set(view);
    });
    inject(DestroyRef).onDestroy(() => this.view()?.destroy());

    // Cambios desde fuera (plantilla, archivo, borrador): reemplaza el texto si no coincide
    effect(() => {
      const view = this.view();
      const value = this.value();
      if (view && value !== view.state.doc.toString()) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
      }
    });
    effect(() => {
      this.view()?.dispatch({ effects: this.lang.reconfigure(languageExtension(this.language())) });
    });
  }
}

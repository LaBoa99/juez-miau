import { ChangeDetectionStrategy, Component, ElementRef, computed, forwardRef, inject, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { ButtonDirective } from '../button.directive';
import { renderMarkdown } from '../../markdown';

type Tool = 'bold' | 'italic' | 'code' | 'block' | 'list' | 'olist' | 'heading' | 'table' | 'link';

// Textarea de markdown con barra de formato y vista previa en vivo (lo mismo que ve el concursante).
@Component({
  selector: 'oj-markdown-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective],
  templateUrl: './markdown-editor.component.html',
  styleUrl: './markdown-editor.component.css',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MarkdownEditor), multi: true }],
})
export class MarkdownEditor implements ControlValueAccessor {
  private readonly sanitizer = inject(DomSanitizer);

  readonly inputId = input<string>();
  readonly rows = input(8);

  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected readonly html = computed(() => this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(this.value())));
  private readonly textarea = viewChild.required<ElementRef<HTMLTextAreaElement>>('ta');

  protected readonly tools: { key: Tool; text: string; label: string }[] = [
    { key: 'bold', text: 'B', label: 'Negrita (Ctrl+B)' },
    { key: 'italic', text: 'I', label: 'Cursiva (Ctrl+I)' },
    { key: 'code', text: '`código`', label: 'Código en línea' },
    { key: 'block', text: '```', label: 'Bloque de código' },
    { key: 'list', text: '• Lista', label: 'Lista' },
    { key: 'olist', text: '1. Lista', label: 'Lista numerada' },
    { key: 'heading', text: 'Título', label: 'Encabezado' },
    { key: 'table', text: 'Tabla', label: 'Tabla' },
    { key: 'link', text: 'Enlace', label: 'Enlace' },
  ];

  private onChange: (v: string) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(v: string | null): void {
    this.value.set(v ?? '');
  }
  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(d: boolean): void {
    this.disabled.set(d);
  }

  protected onInput(v: string): void {
    this.value.set(v);
    this.onChange(v);
  }

  protected onKey(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'b' || key === 'i') {
      e.preventDefault();
      this.apply(key === 'b' ? 'bold' : 'italic');
    }
  }

  apply(tool: Tool): void {
    switch (tool) {
      case 'bold': return this.wrap('**', '**', 'texto');
      case 'italic': return this.wrap('*', '*', 'texto');
      case 'code': return this.wrap('`', '`', 'código');
      case 'block': return this.wrap('\n```\n', '\n```\n', 'código');
      case 'link': return this.wrap('[', '](https://)', 'texto');
      case 'list': return this.prefixLines(() => '- ');
      case 'olist': return this.prefixLines((i) => `${i + 1}. `);
      case 'heading': return this.prefixLines(() => '### ');
      case 'table': return this.wrap('\n| Columna | Columna |\n| --- | --- |\n| ', ' |  |\n', 'valor');
    }
  }

  // Envuelve la selección (o un texto de ejemplo) y la deja seleccionada.
  private wrap(before: string, after: string, placeholder: string): void {
    const ta = this.textarea().nativeElement;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const inner = value.slice(s, e) || placeholder;
    this.commit(value.slice(0, s) + before + inner + after + value.slice(e), s + before.length, s + before.length + inner.length);
  }

  // Antepone un prefijo a cada línea tocada por la selección.
  private prefixLines(prefix: (i: number) => string): void {
    const ta = this.textarea().nativeElement;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const start = value.lastIndexOf('\n', s - 1) + 1;
    const block = value.slice(start, e).split('\n').map((line, i) => prefix(i) + line).join('\n');
    this.commit(value.slice(0, start) + block + value.slice(e), start, start + block.length);
  }

  private commit(next: string, selStart: number, selEnd: number): void {
    const ta = this.textarea().nativeElement;
    ta.value = next;
    ta.focus();
    ta.setSelectionRange(selStart, selEnd);
    this.onInput(next);
  }
}

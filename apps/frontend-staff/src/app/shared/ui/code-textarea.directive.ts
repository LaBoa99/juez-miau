import { Directive } from '@angular/core';

const INDENT = '    ';

export interface CodeEdit {
  start: number;
  end: number;
  text: string;
  selStart: number;
  selEnd: number;
}

// Qué reemplazar al pulsar Tab, Shift+Tab o Enter en un textarea de código; null si no cambia nada
export function codeEdit(key: 'tab' | 'untab' | 'enter', value: string, start: number, end: number): CodeEdit | null {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  if (key === 'enter') {
    const line = value.slice(lineStart, start);
    const indent = /^[ \t]*/.exec(line)![0] + (/[:{]\s*$/.test(line) ? INDENT : '');
    const pos = start + 1 + indent.length;
    return { start, end, text: '\n' + indent, selStart: pos, selEnd: pos };
  }
  const selected = value.slice(start, end);
  if (key === 'tab' && !selected.includes('\n')) {
    const pos = start + INDENT.length;
    return { start, end, text: INDENT, selStart: pos, selEnd: pos };
  }
  // Varias líneas (o Shift+Tab): se sangran o desangran las líneas completas que toca la selección
  const lastEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const nl = value.indexOf('\n', lastEnd);
  const lineEnd = nl < 0 ? value.length : nl;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const changed = lines.map((l) =>
    key === 'tab' ? (l.length ? INDENT + l : l) : l.replace(/^(?: {1,4}|\t)/, ''),
  );
  const text = changed.join('\n');
  const total = text.length - (lineEnd - lineStart);
  if (total === 0) return null;
  // Si la selección empezaba al inicio de la línea, sigue ahí para que el bloque completo quede seleccionado
  const selStart = start === lineStart ? lineStart : Math.max(lineStart, start + changed[0].length - lines[0].length);
  return { start: lineStart, end: lineEnd, text, selStart, selEnd: Math.max(selStart, end + total) };
}

// Textarea de código: Tab y Shift+Tab sangran, Enter conserva la sangría. Esc y luego Tab sale del campo.
@Directive({
  selector: 'textarea[ojCode]',
  host: {
    spellcheck: 'false',
    autocapitalize: 'off',
    autocomplete: 'off',
    title: 'Tab sangra, Shift+Tab quita sangría. Para salir con el teclado: Esc y luego Tab.',
    '[style.tab-size]': '4',
    '(keydown)': 'onKeydown($event)',
    '(blur)': 'released = false',
  },
})
export class CodeTextareaDirective {
  protected released = false;

  protected onKeydown(event: KeyboardEvent): void {
    if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'Escape') { this.released = true; return; }
    const wasReleased = this.released;
    this.released = false;
    const key = event.key === 'Tab' ? (event.shiftKey ? 'untab' : 'tab') : event.key === 'Enter' && !event.shiftKey ? 'enter' : null;
    if (!key || (key !== 'enter' && wasReleased)) return;
    event.preventDefault();
    const ta = event.target as HTMLTextAreaElement;
    const edit = codeEdit(key, ta.value, ta.selectionStart, ta.selectionEnd);
    if (!edit) return;
    ta.setSelectionRange(edit.start, edit.end);
    // execCommand conserva Ctrl+Z y dispara (input); si el navegador no lo soporta, se cambia a mano
    if (!document.execCommand('insertText', false, edit.text)) {
      ta.setRangeText(edit.text);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    ta.setSelectionRange(edit.selStart, edit.selEnd);
  }
}

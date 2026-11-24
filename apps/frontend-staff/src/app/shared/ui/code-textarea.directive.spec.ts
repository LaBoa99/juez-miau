import { codeEdit } from './code-textarea.directive';

function apply(value: string, start: number, end: number, key: 'tab' | 'untab' | 'enter') {
  const e = codeEdit(key, value, start, end);
  if (!e) return null;
  const out = value.slice(0, e.start) + e.text + value.slice(e.end);
  return { out, sel: out.slice(e.selStart, e.selEnd), cursor: e.selStart };
}

describe('codeEdit', () => {
  it('Tab sin selección inserta 4 espacios', () => {
    expect(apply('ab', 1, 1, 'tab')).toEqual({ out: 'a    b', sel: '', cursor: 5 });
  });

  it('Tab con varias líneas sangra cada una y deja vacías las vacías', () => {
    const r = apply('a\n\nb\nc', 0, 4, 'tab')!;
    expect(r.out).toBe('    a\n\n    b\nc');
    expect(r.sel).toBe('    a\n\n    b');
  });

  it('Shift+Tab quita hasta 4 espacios o un tab de cada línea', () => {
    expect(apply('      a\n\tb', 0, 10, 'untab')!.out).toBe('  a\nb');
    expect(apply('  a', 3, 3, 'untab')).toEqual({ out: 'a', sel: '', cursor: 1 });
  });

  it('Shift+Tab sin sangría no cambia nada', () => {
    expect(codeEdit('untab', 'a\nb', 0, 3)).toBeNull();
  });

  it('Enter conserva la sangría y la aumenta tras : o {', () => {
    expect(apply('  x = 1', 7, 7, 'enter')!.out).toBe('  x = 1\n  ');
    expect(apply('if a:', 5, 5, 'enter')!.out).toBe('if a:\n    ');
    expect(apply('  f() {', 7, 7, 'enter')).toEqual({ out: '  f() {\n      ', sel: '', cursor: 14 });
  });
});

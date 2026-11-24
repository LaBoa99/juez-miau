import { TestBed } from '@angular/core/testing';
import { EditorView } from '@codemirror/view';
import { CodeEditor, languageExtension } from './code-editor.component';

describe('CodeEditor', () => {
  async function setup(value: string, language: string | null) {
    const fixture = TestBed.createComponent(CodeEditor);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('language', language);
    fixture.componentRef.setInput('inputId', 'code');
    await fixture.whenStable();
    const content = fixture.nativeElement.querySelector('.cm-content') as HTMLElement;
    return { fixture, content, view: EditorView.findFromDOM(fixture.nativeElement)! };
  }

  it('muestra el valor y avisa lo que se escribe', async () => {
    const { fixture, content, view } = await setup('def f(x):\n    return x', 'python');
    expect(content.id).toBe('code');
    expect(view.state.doc.toString()).toBe('def f(x):\n    return x');

    view.dispatch({ changes: { from: view.state.doc.length, insert: ' + 1' } });
    expect(fixture.componentInstance.value()).toBe('def f(x):\n    return x + 1');
  });

  it('reemplaza el texto cuando el valor cambia desde fuera y acepta otro lenguaje', async () => {
    const { fixture, view } = await setup('', 'java');
    fixture.componentRef.setInput('value', 'int main() {}');
    fixture.componentRef.setInput('language', 'cpp');
    await fixture.whenStable();
    expect(view.state.doc.toString()).toBe('int main() {}');
  });

  it('todos los lenguajes del juez tienen colores; uno desconocido queda sin extensión', () => {
    for (const code of ['python', 'java', 'c', 'cpp', 'javascript', 'typescript', 'csharp']) {
      expect(languageExtension(code)).not.toEqual([]);
    }
    expect(languageExtension('kotlin')).toEqual([]);
  });
});

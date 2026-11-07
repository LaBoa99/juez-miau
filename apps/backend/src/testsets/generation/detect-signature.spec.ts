import { detectSignatures } from './detect-signature.js';

const int = { type: 'int' };
const long = { type: 'long' };
const ints = { type: 'array', items: int };
const strings = { type: 'array', items: { type: 'string' } };

describe('detectSignatures', () => {
  it('python: solo def del nivel superior, sin _privadas ni anidadas ni métodos', () => {
    const source = [
      'import sys',
      '"""def falsa(x: int) -> int: en un docstring"""',
      'def _ayuda(x): return x',
      'class Nodo:',
      '    def valor(self, x: int) -> int:',
      '        return x',
      'def suma(nums: list[int], k: int = 0) -> int:',
      '    def interna(a: int) -> int:  # anidada',
      '        return a',
      '    return sum(nums) + k',
    ].join('\n');
    expect(detectSignatures('python', source)).toEqual([
      { functionName: 'suma', params: [{ name: 'nums', type: ints }, { name: 'k', type: int }], returns: int },
    ]);
  });

  it('python con uniones: int | float es float; None se ignora; int | str no se resuelve', () => {
    const source = [
      'def suma(a: int | float, b: Union[int, float], c: int | None) -> int | float:',
      '    """Suma dos valores numéricos.',
      '    a (int | float): el primero',
      '    """',
      '    return a + b',
      'def mezcla(x: int | str, xs: list[int | float]) -> int:',
      '    return 0',
    ].join('\n');
    expect(detectSignatures('python', source)).toEqual([
      {
        functionName: 'suma',
        params: [{ name: 'a', type: { type: 'float' } }, { name: 'b', type: { type: 'float' } }, { name: 'c', type: int }],
        returns: { type: 'float' },
      },
      { functionName: 'mezcla', params: [{ name: 'x', type: null }, { name: 'xs', type: { type: 'array', items: { type: 'float' } } }], returns: int },
    ]);
  });

  it('python sin type hints: nombres sí, tipos null', () => {
    expect(detectSignatures('python', 'def f(a, b):\n    return a\n')).toEqual([
      { functionName: 'f', params: [{ name: 'a', type: null }, { name: 'b', type: null }], returns: null },
    ]);
  });

  it('cpp: ignora static, main, lambdas, métodos de structs y funciones dentro de namespaces', () => {
    const source = `#include <bits/stdc++.h>
using namespace std;
// int comentada(int x) {}
static int ayuda(int x) { return x; }
struct S { int metodo(int a) { return a; } };
namespace ns { int oculta(int a) { return a; } }
auto lambda = [](int a) { return a; };
long long suma(const vector<int>& nums, int k) {
    for (int i = 0; i < 3; i++) { if (k) { k--; } }
    return k;
}
int main() { return 0; }`;
    expect(detectSignatures('cpp', source)).toEqual([
      { functionName: 'suma', params: [{ name: 'nums', type: ints }, { name: 'k', type: int }], returns: long },
    ]);
  });

  it('java: solo public/package static dentro de Main; private y otras clases no', () => {
    const source = `import java.util.*;
class Ayuda { static int otra(int a) { return a; } }
class Main {
    private static int privada(int a) { return a; }
    int deInstancia(int a) { return a; }
    static String[] partes(String texto, final int n) { return new String[0]; }
    public static void main(String[] args) {}
}`;
    expect(detectSignatures('java', source)).toEqual([
      { functionName: 'partes', params: [{ name: 'texto', type: { type: 'string' } }, { name: 'n', type: int }], returns: strings },
    ]);
  });

  it('csharp: varias candidatas se regresan todas', () => {
    const source = `public class Main {
    public static long Suma(long[] nums) { return 0; }
    public static bool EsPar(int n) => n % 2 == 0;
    public static int Doble(int n) { return n * 2; }
}`;
    expect(detectSignatures('csharp', source).map((s) => s.functionName)).toEqual(['Suma', 'EsPar', 'Doble']);
  });

  it('c: los arrays de judge.h y char *', () => {
    const source = `#include "judge.h"
static int ayuda(int x) { return x; }
char *saluda(StringArray nombres, IntArray2D tabla) { return "hola"; }`;
    expect(detectSignatures('c', source)).toEqual([
      {
        functionName: 'saluda',
        params: [{ name: 'nombres', type: strings }, { name: 'tabla', type: { type: 'array', items: ints } }],
        returns: { type: 'string' },
      },
    ]);
  });

  it('typescript: function y arrow del nivel superior; number se propone como int', () => {
    const source = `function _privada(a: number) {}
export function suma(nums: number[], k: bigint): bigint {
  const interna = (x: number) => x;
  return k;
}
const doble = (n: number): number => n * 2;`;
    expect(detectSignatures('typescript', source)).toEqual([
      { functionName: 'suma', params: [{ name: 'nums', type: ints }, { name: 'k', type: long }], returns: long },
      { functionName: 'doble', params: [{ name: 'n', type: int }], returns: int },
    ]);
  });

  it('javascript: nombres sin tipos', () => {
    expect(detectSignatures('javascript', 'function suma(nums, k = 1) {\n  return 0;\n}\n')).toEqual([
      { functionName: 'suma', params: [{ name: 'nums', type: null }, { name: 'k', type: null }], returns: null },
    ]);
  });

  it('lenguaje desconocido o Java sin clase Main: nada', () => {
    expect(detectSignatures('rust', 'fn main() {}')).toEqual([]);
    expect(detectSignatures('java', 'class Otra { static int f(int a) { return a; } }')).toEqual([]);
  });
});

import { ISubmissionCase, Verdict } from '@concurso/shared-types';
import { caseReason, compileReason, firstDiffLine } from './case-reason';

const c = (verdict: Verdict, extra: Partial<ISubmissionCase> = {}): ISubmissionCase => ({
  ordinal: 1, verdict, cpuMs: 0, wallMs: 0, memoryKb: 0, exitCode: null, message: null, ...extra,
});
const limits = { timeLimitMs: 1000, memoryLimitMb: 256 };

describe('caseReason', () => {
  it('TLE y MLE con lo usado y lo permitido', () => {
    expect(caseReason(c(Verdict.TLE, { cpuMs: 1200 }), limits).text).toBe('Tiempo límite excedido: usó 1200 ms de 1000 ms permitidos.');
    expect(caseReason(c(Verdict.MLE, { memoryKb: 300 * 1024 }), limits).text).toBe('Memoria excedida: usó 300 MB de 256 MB permitidos.');
  });
  it('sin límites o sin dato dice que no hay motivo', () => {
    expect(caseReason(c(Verdict.TLE), null).text).toBe('Motivo no disponible · TLE');
  });
  it('RE resume el error sin el stack completo; WA traduce el texto del juez', () => {
    expect(caseReason(c(Verdict.RE, { message: 'a\nb\nc\nd' }), limits).detail).toBe('a\nb\nc');
    expect(caseReason(c(Verdict.RE, { exitCode: 139 }), limits).detail).toBe('Código de salida 139.');
    const py = 'Traceback (most recent call last):\n  File "a.py", line 3\n    1/0\nZeroDivisionError: division by zero';
    expect(caseReason(c(Verdict.RE, { message: py }), limits).detail).toBe('ZeroDivisionError: division by zero');
    const java = 'Exception in thread "main" java.lang.ArithmeticException\n\tat Main.f(Main.java:3)';
    expect(caseReason(c(Verdict.RE, { message: java }), limits).detail).toBe('Exception in thread "main" java.lang.ArithmeticException');
    expect(caseReason(c(Verdict.WA, { message: 'rejected by the checker' }), limits).detail).toBe('El checker rechazó la salida del programa.');
    expect(caseReason(c(Verdict.WA, { message: 'raw english text' }), limits).detail).toBeNull();
  });
});

describe('compileReason y firstDiffLine', () => {
  it('toma la primera línea con error del compilador', () => {
    expect(compileReason('In file x:\nmain.cpp:3:5: error: falta ;\n').detail).toBe('main.cpp:3:5: error: falta ;');
  });
  it('encuentra la primera línea distinta', () => {
    expect(firstDiffLine('1\n2\n3', '1\n2\n3')).toBeNull();
    expect(firstDiffLine('1\n2\n3', '1\n5\n3')).toBe(1);
    expect(firstDiffLine('1\n2', '1\n2\n3')).toBe(2);
  });
});

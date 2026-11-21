import type { IProblemSignature } from '@concurso/shared-types';
import { mismatchesWith } from './signature.processor.js';

// Firma fija vs. la leída de la solución: lo no leído (null) no cuenta como diferencia
describe('mismatchesWith', () => {
    const fixed: IProblemSignature = { functionName: 'es_par', params: [{ name: 'numero', type: { type: 'int' } }], returns: { type: 'bool' } };

    it('sin diferencias cuando coincide o el tipo no se leyó', () => {
        expect(mismatchesWith(fixed, { functionName: 'es_par', params: [{ name: 'numero', type: { type: 'int' } }], returns: { type: 'bool' } })).toEqual([]);
        expect(mismatchesWith(fixed, { functionName: 'es_par', params: [{ name: 'numero', type: null }], returns: null })).toEqual([]);
    });

    it('nombra el retorno y los parámetros que no coinciden', () => {
        expect(mismatchesWith(fixed, { functionName: 'es_par', params: [{ name: 'numero', type: { type: 'array', items: { type: 'int' } } }], returns: { type: 'string' } }))
            .toEqual(['numero es int[] y la firma pide int', 'regresa string y la firma pide bool']);
        expect(mismatchesWith(fixed, { functionName: 'es_par', params: [], returns: { type: 'bool' } }))
            .toEqual(['recibe 0 parámetros y la firma pide 1']);
    });
});

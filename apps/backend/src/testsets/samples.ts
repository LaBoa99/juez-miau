import { IsNull, Not, type Repository } from 'typeorm'
import { TestCaseVisibility, type IProblemSignature, type IProblemSample } from '@concurso/shared-types'
import { programInput, programOutput } from '../judge/full-program.js'
import type { TestCase } from './entities/test-case.entity.js'

// Los "ejemplos" del enunciado: casos públicos que ya tienen salida (calculada por el build), en orden.
// El enunciado y el detalle de un envío rechazado los numeran igual
export function findSampleCases(repository: Repository<TestCase>, testsetId: number): Promise<TestCase[]> {
    return repository.find({
        where: { testset_id: testsetId, visibility: TestCaseVisibility.PUBLIC, output_sha: Not(IsNull()) },
        order: { ordinal: 'ASC' },
    })
}

// Con `asText` (programa completo) van como el texto que lee y escribe el programa
export function sampleText(asText: IProblemSignature | null, input: string, output: string): IProblemSample {
    return asText ? { input: programInput(asText, input), output: programOutput(asText.returns, output) } : { input, output }
}

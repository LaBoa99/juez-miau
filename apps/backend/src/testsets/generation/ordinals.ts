import type { EntityManager } from 'typeorm'
import { TestCase } from '../entities/test-case.entity.js'

// Renumera los casos 1..n conservando el orden; regresa cuántos quedan.
// En dos pasos (negativos primero) para no chocar con el UNIQUE(testset_id, ordinal)
export async function compactOrdinals(testsetId: number, manager: EntityManager): Promise<number> {
    await manager.query('UPDATE test_case SET ordinal = -ordinal WHERE testset_id = $1', [testsetId])
    await manager.query(
        `UPDATE test_case SET ordinal = numbered.position
         FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY -ordinal) AS position FROM test_case WHERE testset_id = $1) numbered
         WHERE test_case.id = numbered.id`,
        [testsetId],
    )
    return manager.countBy(TestCase, { testset_id: testsetId })
}

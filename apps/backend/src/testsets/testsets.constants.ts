// Cola que consume el worker (fase 3): ejecuta la solución oficial y deja el testset READY o FAILED
export const TESTSET_BUILD_QUEUE = 'testset-build'

export interface TestsetBuildJob {
    testsetId: number
}

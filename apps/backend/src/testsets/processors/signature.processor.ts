import { type OnApplicationBootstrap } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { DataSource } from 'typeorm'
import type { IDetectedSignature, IProblemSignature, ISignatureDetection } from '@concurso/shared-types'
import { JudgeService } from '../../judge/judge.service.js'
import { Language } from '../../languages/entities/language.entity.js'
import { detectSignatures } from '../generation/detect-signature.js'
import { validateSignature } from '../generation/signature.js'
import { SIGNATURE_QUEUE, type SignatureJob } from '../testsets.constants.js'

export type SignatureResult = Pick<ISignatureDetection, 'candidates' | 'chosen' | 'compiles' | 'compileLog'>

// Lee la firma de la solución y, si quedó completa, la confirma compilando con su driver
@Processor(SIGNATURE_QUEUE)
export class SignatureProcessor extends WorkerHost implements OnApplicationBootstrap {

    constructor(
        private readonly dataSource: DataSource,
        private readonly judgeService: JudgeService,
    ) {
        super()
    }

    onApplicationBootstrap(): void {
        this.worker.concurrency = this.judgeService.concurrency
    }

    async process(job: Job<SignatureJob>): Promise<SignatureResult> {
        const language = await this.dataSource.getRepository(Language).findOneByOrFail({ id: job.data.languageId })
        const candidates = detectSignatures(language.code, job.data.source)
        const index = job.data.functionName
            ? candidates.findIndex((candidate) => candidate.functionName === job.data.functionName)
            : candidates.length === 1 ? 0 : -1
        const chosen = index < 0 ? null : index

        const signature = chosen === null ? null : complete(candidates[chosen])
        if(!signature || validateSignature(signature).length > 0){
            return { candidates, chosen, compiles: null, compileLog: null }
        }
        const compiled = await this.judgeService.compileCheck(language, signature, job.data.source)
        return { candidates, chosen, compiles: compiled.ok, compileLog: compiled.log || null }
    }
}

// La firma solo se puede probar si el detector resolvió todos los tipos
function complete(candidate: IDetectedSignature): IProblemSignature | null {
    if(candidate.returns === null || candidate.params.some((param) => param.type === null)) return null
    return {
        functionName: candidate.functionName,
        params: candidate.params.map((param) => ({ name: param.name, type: param.type! })),
        returns: candidate.returns,
    }
}

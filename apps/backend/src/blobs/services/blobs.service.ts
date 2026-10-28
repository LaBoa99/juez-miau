import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { EntityManager, In, Repository } from 'typeorm';
import { Blob } from '../entities/blob.entity.js';

export interface StoredBlob {
    sha: string
    size: number
}

@Injectable()
export class BlobsService {

    constructor(
        @InjectRepository(Blob)
        private readonly blobRepository: Repository<Blob>,
    ) {}

    static sha256(bytes: Buffer): string {
        return createHash('sha256').update(bytes).digest('hex')
    }

    // Idempotente: si el contenido ya existe no se vuelve a escribir
    async put(content: Buffer | string, manager?: EntityManager): Promise<StoredBlob> {
        const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : content
        const sha = BlobsService.sha256(bytes)

        await (manager ?? this.blobRepository.manager)
            .createQueryBuilder()
            .insert()
            .into(Blob)
            .values({ sha, bytes, size: bytes.length })
            .orIgnore()
            .execute()

        return { sha, size: bytes.length }
    }

    async get(sha: string): Promise<Buffer> {
        const blob = await this.blobRepository.findOne({ where: { sha }})
        if(!blob){
            throw new NotFoundException('blob not found ' + sha)
        }

        return blob.bytes
    }

    async getText(sha: string): Promise<string> {
        return (await this.get(sha)).toString('utf8')
    }

    // Los sha que no existan simplemente no aparecen en el mapa
    async getManyText(shas: string[]): Promise<Map<string, string>> {
        const unique = [...new Set(shas)]
        if(unique.length === 0) return new Map()

        const blobs = await this.blobRepository.find({ where: { sha: In(unique) }})
        return new Map(blobs.map((blob) => [blob.sha, blob.bytes.toString('utf8')]))
    }
}

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, MoreThan, Repository } from 'typeorm'
import { createHash, randomBytes } from 'crypto'
import { RefreshToken } from '../entities/refresh-token.entity.js'

@Injectable()
export class RefreshTokensService {
    constructor(
        @InjectRepository(RefreshToken) private readonly refreshTokenRepository: Repository<RefreshToken>,
        private readonly config: ConfigService,
    ) {}

    // Devuelve el token en claro; en BD solo queda su hash
    async issue(userId: number): Promise<string> {
        const token = randomBytes(32).toString('base64url')
        const ttlDays = Number(this.config.get<string>('REFRESH_TOKEN_TTL_DAYS') ?? 7)

        await this.refreshTokenRepository.save(this.refreshTokenRepository.create({
            token_hash: this.hash(token),
            expires_at: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
            user: { id: userId },
        }))

        return token
    }

    // Solo devuelve tokens no revocados ni expirados, con su usuario cargado
    async findActive(token: string): Promise<RefreshToken | null> {
        return this.refreshTokenRepository.findOne({
            where: {
                token_hash: this.hash(token),
                revoked_at: IsNull(),
                expires_at: MoreThan(new Date()),
            },
            relations: { user: true },
        })
    }

    async revoke(token: string): Promise<void> {
        await this.refreshTokenRepository.update(
            { token_hash: this.hash(token), revoked_at: IsNull() },
            { revoked_at: new Date() },
        )
    }

    private hash(token: string): string {
        return createHash('sha256').update(token).digest('hex')
    }
}

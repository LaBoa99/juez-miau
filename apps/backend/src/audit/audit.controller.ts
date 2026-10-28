import { Controller, Get, Query } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'
import { LessThan, Repository, type FindOptionsWhere } from 'typeorm'
import type { IAuditEntry } from '@concurso/shared-types'
import { SuperadminOnly } from '../auth/decorators/access.decorators.js'
import { AuditLog } from './entities/audit-log.entity.js'

export class AuditFiltersDto {
    @IsOptional() @Type(() => Number) @IsInt() declare editionId?: number
    @IsOptional() @Type(() => Number) @IsInt() declare staffUserId?: number
    // Paginación hacia atrás
    @IsOptional() @Type(() => Number) @IsInt() declare before?: number
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) declare limit?: number
}

@Controller('audit')
export class AuditController {

    constructor(
        @InjectRepository(AuditLog)
        private readonly auditRepository: Repository<AuditLog>,
    ) {}

    @Get()
    @SuperadminOnly()
    async find(@Query() filters: AuditFiltersDto): Promise<IAuditEntry[]> {
        const where: FindOptionsWhere<AuditLog> = {}
        if(filters.editionId !== undefined) where.edition_id = filters.editionId
        if(filters.staffUserId !== undefined) where.staff_user_id = filters.staffUserId
        if(filters.before !== undefined) where.id = LessThan(filters.before)

        const entries = await this.auditRepository.find({ where, order: { id: 'DESC' }, take: filters.limit ?? 100 })
        return entries.map((entry) => ({
            id: entry.id,
            staffUserId: entry.staff_user_id,
            editionId: entry.edition_id,
            method: entry.method,
            path: entry.path,
            statusCode: entry.status_code,
            body: entry.body,
            createdAt: entry.created_at,
        }))
    }
}

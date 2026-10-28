import { Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Response } from 'express'
import { tap, type Observable } from 'rxjs'
import { Repository } from 'typeorm'
import { AccessTokenType } from '../auth/factories/access-token-payload.factory.js'
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard.js'
import { AuditLog } from './entities/audit-log.entity.js'
import { sanitizeBody } from './sanitize.js'

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Interceptor global: registra los cambios del staff, también los que fallan (403, 409...).
// Los guards corren antes, así que req.user ya está. No retrasa la respuesta: guarda en segundo plano
@Injectable()
export class AuditInterceptor implements NestInterceptor {
    private readonly logger = new Logger(AuditInterceptor.name)

    constructor(
        @InjectRepository(AuditLog)
        private readonly auditRepository: Repository<AuditLog>,
    ) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if(context.getType() !== 'http') return next.handle()
        const req = context.switchToHttp().getRequest<AuthenticatedRequest>()
        if(!MUTATIONS.has(req.method) || req.user?.type !== AccessTokenType.STAFF) return next.handle()

        const res = context.switchToHttp().getResponse<Response>()
        return next.handle().pipe(tap({
            next: () => this.record(req, res.statusCode),
            error: (error: { status?: number }) => this.record(req, typeof error?.status === 'number' ? error.status : 500),
        }))
    }

    private record(req: AuthenticatedRequest, statusCode: number): void {
        const routePath = String((req.route as { path?: string } | undefined)?.path ?? '')
        const editionParam = req.params.editionId ?? (/\/editions\/:id(\/|$)/.test(routePath) ? req.params.id : undefined)
        const editionId = Number(editionParam)

        // save en vez de insert: insert no acepta un objeto arbitrario en la columna jsonb
        this.auditRepository.save(this.auditRepository.create({
            staff_user_id: req.user.sub,
            edition_id: Number.isInteger(editionId) ? editionId : null,
            method: req.method,
            path: req.originalUrl.split('?')[0].slice(0, 500),
            status_code: statusCode,
            body: sanitizeBody(req.body),
        })).catch((error: unknown) => this.logger.error('could not write the audit log: ' + String(error)))
    }
}

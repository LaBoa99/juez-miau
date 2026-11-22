import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { tap, type Observable } from 'rxjs'
import { AccessTokenType } from '../auth/factories/access-token-payload.factory.js'
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard.js'
import { StandingsService } from './standings.service.js'

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
// Escrituras frecuentes que no tocan el marcador: clics de la barra, corridas de prueba y lectura de firma
const UNRELATED = ['/nav-events', '/test-runs', '/signature-detect']

// El marcador vive en caché y los envíos y el reloj ya la invalidan. Lo demás que lo cambia (borrar o renombrar un
// equipo, aceptar un problema, editar categorías…) son escrituras del staff, pocas: tras cualquiera que salga bien
// se descarta la caché en vez de avisar desde cada servicio (antes un equipo borrado seguía en el marcador)
@Injectable()
export class StandingsInvalidationInterceptor implements NestInterceptor {
    constructor(private readonly standings: StandingsService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if(context.getType() !== 'http') return next.handle()
        const req = context.switchToHttp().getRequest<AuthenticatedRequest>()
        if(!MUTATIONS.has(req.method) || req.user?.type !== AccessTokenType.STAFF) return next.handle()
        if(UNRELATED.some((path) => req.path.includes(path))) return next.handle()
        return next.handle().pipe(tap({ next: () => this.standings.invalidateAll() }))
    }
}

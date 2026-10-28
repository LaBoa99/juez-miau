import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { DataSource } from 'typeorm'
import { EDITION_ACCESS_KEY, EditionScope, type EditionAccess } from '../decorators/access.decorators.js'
import { AccessTokenType } from '../factories/access-token-payload.factory.js'
import type { AuthenticatedRequest } from './jwt-auth.guard.js'
import { StaffService } from '../../staff/services/staff.service.js'
import { EditionStaff } from '../../editions/entities/edition-staff.entity.js'
import { Room } from '../../editions/entities/room.entity.js'
import { Category } from '../../editions/entities/category.entity.js'
import { Team } from '../../teams/entities/team.entity.js'

const SCOPE_ENTITIES = {
    [EditionScope.ROOM]: Room,
    [EditionScope.CATEGORY]: Category,
    [EditionScope.TEAM]: Team,
}

// Guard global que corre después de JwtAuthGuard. Solo actúa en rutas con
// @RequireEditionRole() o @SuperadminOnly()
@Injectable()
export class EditionRoleGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly staffService: StaffService,
        private readonly dataSource: DataSource,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (context.getType() !== 'http') return true

        const access = this.reflector.getAllAndOverride<EditionAccess>(EDITION_ACCESS_KEY, [context.getHandler(), context.getClass()])
        if (!access) return true

        const req = context.switchToHttp().getRequest<AuthenticatedRequest>()
        if (req.user?.type !== AccessTokenType.STAFF) {
            throw new ForbiddenException('Solo el staff puede acceder a este recurso')
        }

        const user = await this.staffService.findById(req.user.sub)
        if (!user?.active) {
            throw new UnauthorizedException('Usuario inactivo o inexistente')
        }

        if (user.is_superadmin) return true
        if (access.superadminOnly) {
            throw new ForbiddenException('Solo un superadmin puede acceder a este recurso')
        }

        const editionId = await this.resolveEditionId(access, req.params)
        const assignment = await this.dataSource.getRepository(EditionStaff).findOneBy({
            edition_id: editionId,
            staff_user_id: user.id,
        })

        if (!assignment || !access.roles?.includes(assignment.role)) {
            throw new ForbiddenException('No tienes permiso para esta acción en la edición #' + editionId)
        }
        return true
    }

    private async resolveEditionId(access: EditionAccess, params: AuthenticatedRequest['params']): Promise<number> {
        const scope = access.scope ?? EditionScope.EDITION
        const id = Number(params[access.param ?? 'editionId'])
        // Un id inválido lo rechaza después el ParseIntPipe con 400; aquí basta con negar el acceso
        if (!Number.isInteger(id)) {
            throw new ForbiddenException('No tienes permiso para esta acción')
        }

        if (scope === EditionScope.EDITION) return id

        const entity = await this.dataSource.getRepository(SCOPE_ENTITIES[scope]).findOne({
            where: { id },
            select: { id: true, edition_id: true },
        })
        if (!entity) {
            throw new NotFoundException(scope + ' not found #' + id)
        }
        return entity.edition_id
    }
}

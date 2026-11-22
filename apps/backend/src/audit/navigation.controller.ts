import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Type } from 'class-transformer'
import { IsEnum, IsIn, IsInt, IsOptional, ValidateIf } from 'class-validator'
import { DataSource, Repository } from 'typeorm'
import { EDITION_SECTIONS, EditionStatus, type EditionSection, type ICreateNavEvent, type INavCount, type NavRole } from '@concurso/shared-types'
import { ANY_EDITION_ROLE, RequireEditionRole, SuperadminOnly } from '../auth/decorators/access.decorators.js'
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard.js'
import { StaffUser } from '../staff/entities/staff-user.entity.js'
import { EditionStaff } from '../editions/entities/edition-staff.entity.js'
import { Edition } from '../editions/entities/edition.entity.js'
import { NavEvent } from './entities/nav-event.entity.js'

const SECTIONS = EDITION_SECTIONS.map((section) => section.path)

export class CreateNavEventDto implements ICreateNavEvent {
    @ValidateIf((_, value) => value !== null)
    @IsIn(SECTIONS)
    declare from: EditionSection | null

    @IsIn(SECTIONS)
    declare to: EditionSection
}

export class NavFiltersDto {
    @IsOptional() @Type(() => Number) @IsInt() declare editionId?: number
    @IsOptional() @IsEnum(EditionStatus) declare status?: EditionStatus
}

// Prueba de calor de la barra de secciones: el panel registra cada clic y el superadmin ve los conteos
@Controller()
export class NavigationController {

    constructor(
        @InjectRepository(NavEvent)
        private readonly navRepository: Repository<NavEvent>,
        private readonly dataSource: DataSource,
    ) {}

    @Post('editions/:editionId/nav-events')
    @HttpCode(HttpStatus.NO_CONTENT)
    @RequireEditionRole(ANY_EDITION_ROLE)
    async record(
        @Param('editionId', ParseIntPipe) editionId: number,
        @Body() dto: CreateNavEventDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<void> {
        const user = await this.dataSource.getRepository(StaffUser).findOneBy({ id: req.user.sub })
        const assignment = user?.is_superadmin ? null : await this.dataSource.getRepository(EditionStaff).findOneBy({ edition_id: editionId, staff_user_id: req.user.sub })
        const role: NavRole | null = user?.is_superadmin ? 'superadmin' : assignment ? assignment.role.toLowerCase() as NavRole : null
        const edition = await this.dataSource.getRepository(Edition).findOneBy({ id: editionId })
        if(!role || !edition) return

        await this.navRepository.insert({ edition_id: editionId, role, from_section: dto.from, to_section: dto.to, edition_status: edition.status })
    }

    @Get('audit/navigation')
    @SuperadminOnly()
    async counts(@Query() filters: NavFiltersDto): Promise<INavCount[]> {
        const query = this.navRepository.createQueryBuilder('event')
            .select('event.role', 'role')
            .addSelect('event.from_section', 'from')
            .addSelect('event.to_section', 'to')
            .addSelect('COUNT(*)', 'count')
            .groupBy('event.role')
            .addGroupBy('event.from_section')
            .addGroupBy('event.to_section')
        if(filters.editionId !== undefined) query.andWhere('event.edition_id = :editionId', { editionId: filters.editionId })
        if(filters.status !== undefined) query.andWhere('event.edition_status = :status', { status: filters.status })

        const rows = await query.getRawMany<{ role: NavRole, from: EditionSection | null, to: EditionSection, count: string }>()
        return rows.map((row) => ({ ...row, count: Number(row.count) }))
    }
}

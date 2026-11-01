import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaffRole, type IEditionStaff, type IEditionStaffListItem } from '@concurso/shared-types';
import { EditionStaff } from '../entities/edition-staff.entity.js';
import { EditionsService } from './editions.service.js';
import { CreateEditionStaffDto } from '../dto/create-edition-staff.dto.js';
import { StaffService } from '../../staff/services/staff.service.js';

// Lo mínimo de un problema para decidir quién lo edita (evita importar la entidad aquí)
export interface ProblemOwnership {
    id: number
    edition_id: number
    created_by: number | null
}

@Injectable()
export class EditionStaffService {

    constructor(
        @InjectRepository(EditionStaff)
        private readonly editionStaffRepository: Repository<EditionStaff>,
        private readonly editionsService: EditionsService,
        private readonly staffService: StaffService,
    ) {}

    getRepository(): Repository<EditionStaff> {
        return this.editionStaffRepository;
    }

    async findAllByEdition(editionId: number): Promise<EditionStaff[]> {
        return this.editionStaffRepository.find({
            where: {
                edition_id: editionId
            }
        })
    }

    async findAllByStaffUser(staffUserId: number): Promise<EditionStaff[]> {
        return this.editionStaffRepository.find({
            where: {
                staff_user_id: staffUserId
            }
        })
    }

    // Gestionar problemas y veredictos: superadmin, o juez/admin de esa edición
    async assertCanJudge(staffUserId: number, editionId: number): Promise<void> {
        await this.assertRole(staffUserId, editionId, [StaffRole.ADMIN, StaffRole.JUDGE])
    }

    // Superadmin, o alguno de `roles` en la edición. Para chequeos dentro de servicios, cuando la
    // ruta no permite resolver la edición con @RequireEditionRole
    async assertRole(staffUserId: number, editionId: number, roles: StaffRole[]): Promise<void> {
        const user = await this.staffService.findById(staffUserId)
        if(!user?.active){
            throw new UnauthorizedException('Usuario inactivo o inexistente')
        }

        if(user.is_superadmin) return

        const assignment = await this.editionStaffRepository.findOneBy({
            edition_id: editionId,
            staff_user_id: staffUserId
        })

        if(!assignment || !roles.includes(assignment.role)){
            throw new ForbiddenException('staff user #' + staffUserId + ' has no ' + roles.join('/') + ' role in edition #' + editionId)
        }
    }

    // Editar un problema: su autor (si es juez o admin de la edición), cualquier admin de la edición
    // o un superadmin. Los demás jueces de la edición solo lo pueden ver
    async canEditProblem(staffUserId: number, problem: ProblemOwnership): Promise<boolean> {
        const user = await this.staffService.findById(staffUserId)
        if(!user?.active){
            throw new UnauthorizedException('Usuario inactivo o inexistente')
        }
        if(user.is_superadmin) return true

        const assignment = await this.editionStaffRepository.findOneBy({ edition_id: problem.edition_id, staff_user_id: staffUserId })
        if(!assignment || ![StaffRole.ADMIN, StaffRole.JUDGE].includes(assignment.role)){
            throw new ForbiddenException('staff user #' + staffUserId + ' has no ADMIN/JUDGE role in edition #' + problem.edition_id)
        }
        return assignment.role === StaffRole.ADMIN || problem.created_by === staffUserId
    }

    async assertCanEditProblem(staffUserId: number, problem: ProblemOwnership): Promise<void> {
        if(!(await this.canEditProblem(staffUserId, problem))){
            throw new ForbiddenException('only the author of problem #' + problem.id + ' or an edition admin can edit it')
        }
    }

    async assign(editionId: number, dto: CreateEditionStaffDto): Promise<EditionStaff> {
        const editionStaffMember = this.editionStaffRepository.create()

        const edition = await this.editionsService.getById(editionId)

        const staffUser = await this.staffService.findById(dto.staff_user_id)
        if(!staffUser?.active){
            throw new NotFoundException('staff user not found #' + dto.staff_user_id)
        }

        const alreadyAssigned = await this.editionStaffRepository.existsBy({
            edition_id: editionId,
            staff_user_id: dto.staff_user_id
        })

        if(alreadyAssigned){
            throw new ConflictException('staff user #' + dto.staff_user_id + ' is already assigned to edition #' + editionId)
        }

        editionStaffMember.role = dto.role
        editionStaffMember.edition_id = edition.id
        editionStaffMember.staff_user_id = dto.staff_user_id

        return this.editionStaffRepository.save(editionStaffMember)
    }

    async remove(editionId: number, staffUserId: number): Promise<void> {
        const result = await this.editionStaffRepository.delete({
            edition_id: editionId,
            staff_user_id: staffUserId
        })

        if(!result.affected){
            throw new NotFoundException('staff user #' + staffUserId + ' is not assigned to edition #' + editionId)
        }
    }

}

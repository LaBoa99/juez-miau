import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaffRole, type IEditionStaff, type IEditionStaffListItem } from '@concurso/shared-types';
import { EditionStaff } from '../entities/edition-staff.entity.js';
import { EditionsService } from './editions.service.js';
import { CreateEditionStaffDto } from '../dto/create-edition-staff.dto.js';
import { StaffService } from '../../staff/services/staff.service.js';

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
        const user = await this.staffService.findById(staffUserId)
        if(!user?.active){
            throw new UnauthorizedException('Usuario inactivo o inexistente')
        }

        if(user.is_superadmin) return

        const assignment = await this.editionStaffRepository.findOneBy({
            edition_id: editionId,
            staff_user_id: staffUserId
        })

        if(assignment?.role !== StaffRole.JUDGE && assignment?.role !== StaffRole.ADMIN){
            throw new ForbiddenException('staff user #' + staffUserId + ' is not a judge of edition #' + editionId)
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

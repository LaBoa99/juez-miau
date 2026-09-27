import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { IEditionStaff, IEditionStaffListItem } from '@concurso/shared-types';
import { EditionStaff } from '../entities/edition-staff.entity.js';
import { EditionsService } from './editions.service.js';
import { CreateEditionStaffDto } from '../dto/create-edition-staff.dto.js';

@Injectable()
export class EditionStaffService {

    constructor(
        @InjectRepository(EditionStaff)
        private readonly editionStaffRepository: Repository<EditionStaff>,
        private readonly editionsService: EditionsService,
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

    async assign(editionId: number, dto: CreateEditionStaffDto): Promise<EditionStaff> {
        const editionStaffMember = this.editionStaffRepository.create()

        const edition = await this.editionsService.getById(editionId)
        
        // search for staff 
        // PENDIENTE 

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

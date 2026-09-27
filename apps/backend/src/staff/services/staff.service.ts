import { Injectable, NotImplementedException, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { StaffUser } from '../entities/staff-user.entity.js'
import { RefreshToken } from '../../auth/entities/refresh-token.entity.js'
import { ListStaffQueryDto } from '../dto/list-staff-query.dto.js'
import { CreateStaffDto } from '../dto/create-staff.dto.js'
import { UpdateStaffDto } from '../dto/update-staff.dto.js'

@Injectable()
export class StaffService {
    constructor(
        @InjectRepository(StaffUser) private readonly staffRepo: Repository<StaffUser>,
        @InjectRepository(RefreshToken) private readonly refreshRepo: Repository<RefreshToken>,
    ) {}

    async findAll(query: ListStaffQueryDto) {
        // TODO: filtrar por active y buscar por name o email.
        // Responde: [{ id, name, email, active, createdAt }]
        throw new NotImplementedException()
    }

    async create(dto: CreateStaffDto) {
        // TODO: 409 si el email existe, hash con argon2id, guardar.
        // Responde: { id, name, email, active: true }
        throw new NotImplementedException()
    }

    async update(id: number, dto: UpdateStaffDto) {
        // TODO: 404 si no existe, 409 si el email nuevo ya existe,
        // re-hashear y revocar refresh tokens si cambia la contraseña.
        // Responde: { id, name, email, active }
        throw new NotImplementedException()
    }

    async deactivate(id: number) {
        // TODO: 404 si no existe, active = false, revocar sus refresh tokens.
        // Responde: { id, active: false }
        throw new NotImplementedException()
    }

    async findByEmail(email: string) {
        const staffUser = await this.staffRepo.findOne({
            where: { email },
            select: { id: true, name: true, email: true, password_hash: true, is_superadmin: true, active: true, created_at: true },
        })

        if(!staffUser) throw new UnauthorizedException('');

        return staffUser;
    }
}
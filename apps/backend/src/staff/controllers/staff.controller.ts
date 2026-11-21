import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common'
import { ListStaffQueryDto } from '../dto/list-staff-query.dto.js'
import { CreateStaffDto } from '../dto/create-staff.dto.js'
import { UpdateStaffDto } from '../dto/update-staff.dto.js'
import { StaffService } from '../services/staff.service.js'
import { SuperadminOnly } from '../../auth/decorators/access.decorators.js'

@Controller('staff')
@SuperadminOnly()
export class StaffController {
    constructor(private readonly staffService: StaffService) {}

    // GET /api/v1/staff?active=true&search=
    @Get()
    findAll(@Query() query: ListStaffQueryDto) {
        return this.staffService.findAll(query)
    }

    // GET /api/v1/staff/credentials?active=true&search= (mismos filtros que la lista, para el PDF)
    @Get('credentials')
    findAllCredentials(@Query() query: ListStaffQueryDto) {
        return this.staffService.getCredentials(query)
    }

    // GET /api/v1/staff/:id/credentials
    @Get(':id/credentials')
    async findCredentials(@Param('id', ParseIntPipe) id: number) {
        const [credentials] = await this.staffService.getCredentials({}, id)
        return credentials
    }

    // POST /api/v1/staff/:id/reset-password
    @Post(':id/reset-password')
    @HttpCode(200)
    resetPassword(@Param('id', ParseIntPipe) id: number) {
        return this.staffService.resetPassword(id)
    }

    // POST /api/v1/staff
    @Post()
    create(@Body() dto: CreateStaffDto) {
        return this.staffService.create(dto)
    }

    // PATCH /api/v1/staff/:id
    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStaffDto) {
        return this.staffService.update(id, dto)
    }

    // POST /api/v1/staff/:id/deactivate
    @Post(':id/deactivate')
    @HttpCode(200)
    deactivate(@Param('id', ParseIntPipe) id: number) {
        return this.staffService.deactivate(id)
    }
}
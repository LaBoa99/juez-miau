import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common'
import { ListStaffQueryDto } from '../dto/list-staff-query.dto.js'
import { CreateStaffDto } from '../dto/create-staff.dto.js'
import { UpdateStaffDto } from '../dto/update-staff.dto.js'
import { StaffService } from '../services/staff.service.js'

@Controller('staff')
export class StaffController {
    constructor(private readonly staffService: StaffService) {}

    // GET /api/v1/staff?active=true&search=
    @Get()
    findAll(@Query() query: ListStaffQueryDto) {
        return this.staffService.findAll(query)
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
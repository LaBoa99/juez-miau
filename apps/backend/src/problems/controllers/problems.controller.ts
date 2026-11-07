import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseFilePipeBuilder, ParseIntPipe, Patch, Post, Put, Req, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { IProblem, IProblemDetail, IProblemPreview, IPublishProblemResponse } from '@concurso/shared-types';
import type { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard.js';
import { ProblemsService } from '../services/problems.service.js';
import { UpdateProblemDto } from '../dto/update-problem.dto.js';

// La cabecera %PDF- la revisa el servicio
const pdfFilePipe = new ParseFilePipeBuilder()
    .addMaxSizeValidator({ maxSize: 10 * 1024 * 1024 })
    .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY })

@Controller('problems')
export class ProblemsController {

    constructor(
        private readonly problemsService: ProblemsService,
    ) {}

    @Get(':id')
    getProblem(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<IProblemDetail> {
        return this.problemsService.getDetail(id, req.user.sub);
    }

    @Patch(':id')
    updateProblem(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateProblemDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<IProblem> {
        return this.problemsService.update(id, dto, req.user.sub);
    }

    // Enunciado en PDF: subirlo quita el markdown (y escribir markdown lo quita a él)
    @Put(':id/statement-pdf')
    @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
    setStatementPdf(
        @Param('id', ParseIntPipe) id: number,
        @UploadedFile(pdfFilePipe) file: Express.Multer.File,
        @Req() req: AuthenticatedRequest,
    ): Promise<IProblem> {
        return this.problemsService.setStatementPdf(id, file.buffer, req.user.sub);
    }

    @Delete(':id/statement-pdf')
    @HttpCode(HttpStatus.NO_CONTENT)
    removeStatementPdf(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest): Promise<void> {
        return this.problemsService.removeStatementPdf(id, req.user.sub);
    }

    @Get(':id/statement-pdf')
    async getStatementPdf(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest): Promise<StreamableFile> {
        return new StreamableFile(await this.problemsService.getStatementPdf(id, req.user.sub), { type: 'application/pdf' });
    }

    @Get(':id/preview')
    previewProblem(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<IProblemPreview> {
        return this.problemsService.preview(id, req.user.sub);
    }

    // El autor lo propone; el admin de la edición (o superadmin) lo acepta o lo saca del concurso
    @Post(':id/propose')
    @HttpCode(HttpStatus.OK)
    proposeProblem(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<IPublishProblemResponse> {
        return this.problemsService.propose(id, req.user.sub);
    }

    @Post(':id/accept')
    @HttpCode(HttpStatus.OK)
    acceptProblem(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<IPublishProblemResponse> {
        return this.problemsService.accept(id, req.user.sub);
    }

    @Post(':id/disable')
    @HttpCode(HttpStatus.OK)
    disableProblem(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<IPublishProblemResponse> {
        return this.problemsService.disable(id, req.user.sub);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    deleteProblem(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<void> {
        return this.problemsService.remove(id, req.user.sub);
    }
}

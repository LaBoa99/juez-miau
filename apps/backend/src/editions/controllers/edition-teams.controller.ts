import { Controller, Get, HttpStatus, Param, ParseFilePipeBuilder, ParseIntPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { EditionTeamsService } from '../services/edition-teams.service.js';
import { CsvFileValidator } from '../../utils/validators/csv-file.validator.js';
import { TeamFiltersDto } from '../../teams/dtos/team-filters.dto.js';
import { RequireEditionRole, ANY_EDITION_ROLE } from '../../auth/decorators/access.decorators.js';
import { StaffRole } from '@concurso/shared-types';

const csvFilePipe = new ParseFilePipeBuilder()
    .addValidator(new CsvFileValidator())
    .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
    .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY })

@Controller('editions/:editionId/teams')
export class EditionTeamsController {

    constructor(
        private readonly editionTeamsService: EditionTeamsService,
    ) {}

    @Post('import/validate')
    @RequireEditionRole([StaffRole.ADMIN])
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
        }),
    )
    validateCSVTeams(
        @Param('editionId', ParseIntPipe) editionId: number,
        @UploadedFile(csvFilePipe) file: Express.Multer.File
    ) {
        return this.editionTeamsService.validateImport(editionId, file.buffer)
    }

    @Post('import')
    @RequireEditionRole([StaffRole.ADMIN])
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
        }),
    )
    importTeamsFromCSV(
        @Param('editionId', ParseIntPipe) editionId: number,
        @UploadedFile(csvFilePipe) file: Express.Multer.File
    ) {
        return this.editionTeamsService.importFromCsv(editionId, file.buffer)
    }

    @Get('')
    @RequireEditionRole(ANY_EDITION_ROLE)
    getTeamsOfEdition(
        @Param('editionId', ParseIntPipe) editionId: number,
        @Query() filters: TeamFiltersDto,
    ){
        return this.editionTeamsService.findAllByEdition(editionId, filters)
    }
}

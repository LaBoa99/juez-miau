import { Module } from '@nestjs/common';
import { CsvService } from './services/csv.service.js';
import { PasswordService } from './services/password.service.js';

@Module({
  providers: [
    CsvService,
    PasswordService
  ],
  exports: [
    CsvService,
    PasswordService
  ],
})
export class UtilsModule {}

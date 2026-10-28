import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Blob } from './entities/blob.entity.js';
import { BlobsService } from './services/blobs.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Blob])],
  providers: [BlobsService],
  exports: [BlobsService],
})
export class BlobsModule {}

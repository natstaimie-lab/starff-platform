import { Module } from '@nestjs/common';
import { DocumentCheckService } from './document-check.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [DocumentCheckService],
  exports: [DocumentCheckService],
})
export class DocumentCheckModule {}

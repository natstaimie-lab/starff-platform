import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global so we don't have to import PrismaModule in every feature module.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

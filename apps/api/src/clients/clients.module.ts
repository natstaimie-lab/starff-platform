import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { RegistrationModule } from '../registration/registration.module';

@Module({
  imports: [RegistrationModule],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}

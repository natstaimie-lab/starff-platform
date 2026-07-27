import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { EnquiriesService } from './enquiries.service';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';

@ApiTags('enquiries')
@Controller('enquiries')
export class EnquiriesController {
  constructor(private readonly enquiries: EnquiriesService) {}

  /**
   * Public webhook the WordPress forms POST to. Not protected by login —
   * instead it checks a shared secret header so only our site can call it.
   */
  @Public()
  @Post()
  create(
    @Body() dto: CreateEnquiryDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    if (secret !== process.env.WORDPRESS_WEBHOOK_SECRET) {
      throw new UnauthorizedException('Bad webhook secret');
    }
    return this.enquiries.create(dto);
  }

  // Staff only — read the submissions in the admin dashboard.
  @Get()
  @Roles(Role.ADMIN, Role.RECRUITER)
  findAll(@Query('type') type?: string, @Query('status') status?: string) {
    return this.enquiries.findAll({ type, status });
  }

  // Staff only — promote an enquiry into a Candidate or Client.
  @Post(':id/convert')
  @Roles(Role.ADMIN, Role.RECRUITER)
  convert(@Param('id') id: string) {
    return this.enquiries.convert(id);
  }
}

import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ShiftsService } from './shifts.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { Roles } from '../auth/roles.decorator';

@ApiTags('shifts')
@ApiBearerAuth()
@Controller('shifts')
@Roles(Role.ADMIN, Role.RECRUITER)
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Post()
  create(@Body() dto: CreateShiftDto) {
    return this.shifts.create(dto);
  }

  @Get()
  findAll() {
    return this.shifts.findAll();
  }

  /** Short-lived links to the worker's clock-in selfie and their verified
   * identity selfie, so staff can compare the two side by side. */
  @Get(':id/check-in-photo')
  checkInPhoto(@Param('id') id: string) {
    return this.shifts.checkInPhoto(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.shifts.update(id, dto);
  }
}

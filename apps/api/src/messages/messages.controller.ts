import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { MessagesService } from './messages.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  // ---------- member (candidate / client) ----------
  @Get('thread')
  @Roles(Role.CANDIDATE, Role.CLIENT)
  thread(@CurrentUser() u: AuthUser) {
    return this.messages.memberThread(u.id, u.role);
  }

  @Post('thread')
  @Roles(Role.CANDIDATE, Role.CLIENT)
  send(@CurrentUser() u: AuthUser, @Body('body') body: string) {
    return this.messages.memberSend(u.id, u.role, body);
  }

  // ---------- staff (admin / recruiter) ----------
  @Get('conversations')
  @Roles(Role.ADMIN, Role.RECRUITER)
  list() {
    return this.messages.listConversations();
  }

  @Get('conversations/:id')
  @Roles(Role.ADMIN, Role.RECRUITER)
  staffThread(@Param('id') id: string) {
    return this.messages.staffThread(id);
  }

  @Post('conversations/:id')
  @Roles(Role.ADMIN, Role.RECRUITER)
  staffSend(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body('body') body: string) {
    return this.messages.staffSend(u.id, id, body);
  }
}

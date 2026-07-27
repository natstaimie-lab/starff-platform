import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

/**
 * Member-facing notifications. No @Roles → any authenticated user (candidate,
 * client or staff); every action is scoped to the caller's own userId, so a
 * user can only see/modify their own notifications and device tokens.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.listForUser(user.id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  // Expo push token registration for the mobile app.
  @Post('push-tokens')
  registerToken(
    @CurrentUser() user: AuthUser,
    @Body() body: { token: string; platform?: string },
  ) {
    return this.notifications.registerPushToken(user.id, body.token, body.platform);
  }

  @Delete('push-tokens')
  removeToken(@CurrentUser() user: AuthUser, @Body() body: { token: string }) {
    return this.notifications.removePushToken(user.id, body.token);
  }
}

import { Global, Module } from '@nestjs/common';
import { NotificationsService } from '@/modules/notifications/services/notifications.service';
import { NotificationsController } from '@/modules/notifications/controllers/notifications.controller';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

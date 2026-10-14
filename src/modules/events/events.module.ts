import { Module } from '@nestjs/common';
import { EventsService } from '@/modules/events/services/events.service';
import { EventsController } from '@/modules/events/controllers/events.controller';

@Module({ controllers: [EventsController], providers: [EventsService], exports: [EventsService] })
export class EventsModule {}

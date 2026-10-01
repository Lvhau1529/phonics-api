import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './v1/events.controller';

@Module({ controllers: [EventsController], providers: [EventsService], exports: [EventsService] })
export class EventsModule {}

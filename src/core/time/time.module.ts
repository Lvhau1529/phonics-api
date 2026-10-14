import { Global, Module } from '@nestjs/common';
import { TimeService } from '@/core/time/time.service';

@Global()
@Module({ providers: [TimeService], exports: [TimeService] })
export class TimeModule {}

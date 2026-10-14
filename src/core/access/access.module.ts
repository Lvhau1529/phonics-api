import { Global, Module } from '@nestjs/common';
import { AccessService } from '@/core/access/access.service';

@Global()
@Module({ providers: [AccessService], exports: [AccessService] })
export class AccessModule {}

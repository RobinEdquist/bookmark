import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MamClientService } from './mam-client.service';

@Module({
  imports: [ConfigModule],
  providers: [MamClientService],
  exports: [MamClientService],
})
export class MamClientModule {}

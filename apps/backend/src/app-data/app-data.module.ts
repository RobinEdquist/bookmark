import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppDataService } from './app-data.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [AppDataService],
  exports: [AppDataService],
})
export class AppDataModule {}

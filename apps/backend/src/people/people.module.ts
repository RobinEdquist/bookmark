import { Module } from '@nestjs/common';
import { PeopleController } from './people.controller';
import { AppDataModule } from '../app-data/app-data.module';

@Module({
  imports: [AppDataModule],
  controllers: [PeopleController],
})
export class PeopleModule {}

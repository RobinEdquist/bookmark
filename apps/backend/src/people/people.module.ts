import { Module } from '@nestjs/common';
import { PeopleController } from './people.controller';
import { AppDataModule } from '../app-data/app-data.module';
import { DatabaseModule } from '../database/database.module';
import { PeopleAdminController } from './people-admin.controller';
import { PeopleAdminService } from './people-admin.service';

@Module({
  imports: [AppDataModule, DatabaseModule],
  controllers: [PeopleController, PeopleAdminController],
  providers: [PeopleAdminService],
})
export class PeopleModule {}

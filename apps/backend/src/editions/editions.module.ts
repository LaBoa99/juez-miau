import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EditionsController } from './controllers/editions.controller.js';
import { EditionCategoriesController } from './controllers/edition-categories.controller.js';
import { EditionRoomsController } from './controllers/edition-rooms.controller.js';
import { RoomsController } from './controllers/rooms.controller.js';
import { RoomObserversController } from './controllers/room-observers.controller.js';
import { RoomProyectorsController } from './controllers/room-proyectors.controller.js';
import { CategoriesController } from './controllers/categories.controller.js';
import { EditionStaffController } from './controllers/edition-staff.controller.js';
import { EditionsService } from './services/editions.service.js';
import { EditionCategoriesService } from './services/edition-categories.service.js';
import { EditionRoomsService } from './services/edition-rooms.service.js';
import { RoomsService } from './services/rooms.service.js';
import { RoomObserversService } from './services/room-observers.service.js';
import { RoomProyectorsService } from './services/room-proyectors.service.js';
import { CategoriesService } from './services/categories.service.js';
import { EditionStaffService } from './services/edition-staff.service.js';
import { Edition } from './entities/edition.entity.js';
import { Category } from './entities/category.entity.js';
import { Room } from './entities/room.entity.js';
import { EditionStaff } from './entities/edition-staff.entity.js';
import { RoomObserver } from './entities/room-observer.entity.js';
import { EditionTeamsController } from './controllers/edition-teams.controller.js';
import { EditionTeamsService } from './services/edition-teams.service.js';
import { UtilsModule } from '../utils/utils.module.js';
import { TeamsModule } from '../teams/teams.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Edition,
      Category,
      Room,
      EditionStaff,
      RoomObserver,
    ]),
    UtilsModule,
    TeamsModule,
  ],
  controllers: [
    EditionsController,
    EditionCategoriesController,
    EditionRoomsController,
    RoomsController,
    RoomObserversController,
    RoomProyectorsController,
    CategoriesController,
    EditionStaffController,
    EditionTeamsController,
  ],
  providers: [
    EditionsService,
    EditionCategoriesService,
    EditionRoomsService,
    RoomsService,
    RoomObserversService,
    RoomProyectorsService,
    CategoriesService,
    EditionStaffService,
    EditionTeamsService,
  ],
  exports: [EditionStaffService],
})
export class EditionsModule {}

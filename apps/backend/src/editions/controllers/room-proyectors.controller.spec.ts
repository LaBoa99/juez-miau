import { Test, TestingModule } from '@nestjs/testing';
import { RoomProyectorsController } from './room-proyectors.controller.js';
import { RoomProyectorsService } from '../services/room-proyectors.service.js';

describe('RoomProyectorsController', () => {
  let controller: RoomProyectorsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoomProyectorsController],
      providers: [{ provide: RoomProyectorsService, useValue: {} }],
    }).compile();

    controller = module.get<RoomProyectorsController>(RoomProyectorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

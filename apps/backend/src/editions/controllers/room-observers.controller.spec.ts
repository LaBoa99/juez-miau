import { Test, TestingModule } from '@nestjs/testing';
import { RoomObserversController } from './room-observers.controller.js';
import { RoomObserversService } from '../services/room-observers.service.js';

describe('RoomObserversController', () => {
  let controller: RoomObserversController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoomObserversController],
      providers: [{ provide: RoomObserversService, useValue: {} }],
    }).compile();

    controller = module.get<RoomObserversController>(RoomObserversController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

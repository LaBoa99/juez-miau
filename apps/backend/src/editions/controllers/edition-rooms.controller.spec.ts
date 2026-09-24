import { Test, TestingModule } from '@nestjs/testing';
import { EditionRoomsController } from './edition-rooms.controller.js';
import { EditionRoomsService } from '../services/edition-rooms.service.js';

describe('EditionRoomsController', () => {
  let controller: EditionRoomsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EditionRoomsController],
      providers: [{ provide: EditionRoomsService, useValue: {} }],
    }).compile();

    controller = module.get<EditionRoomsController>(EditionRoomsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

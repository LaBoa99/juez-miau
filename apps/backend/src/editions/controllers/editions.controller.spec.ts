import { Test, TestingModule } from '@nestjs/testing';
import { EditionsController } from './editions.controller.js';
import { EditionsService } from '../services/editions.service.js';

describe('EditionsController', () => {
  let controller: EditionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EditionsController],
      providers: [{ provide: EditionsService, useValue: {} }],
    }).compile();

    controller = module.get<EditionsController>(EditionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

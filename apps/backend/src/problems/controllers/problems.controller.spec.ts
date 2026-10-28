import { Test, TestingModule } from '@nestjs/testing';
import { ProblemsController } from './problems.controller.js';
import { ProblemsService } from '../services/problems.service.js';

describe('ProblemsController', () => {
  let controller: ProblemsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProblemsController],
      providers: [{ provide: ProblemsService, useValue: {} }],
    })
      .compile();

    controller = module.get<ProblemsController>(ProblemsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

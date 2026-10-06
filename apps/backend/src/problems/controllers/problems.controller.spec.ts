import { Test, TestingModule } from '@nestjs/testing';
import { ProblemsController } from './problems.controller.js';
import { ProblemsService } from '../services/problems.service.js';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard.js';

describe('ProblemsController', () => {
  let controller: ProblemsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProblemsController],
      providers: [{ provide: ProblemsService, useValue: {} }],
    })
      .overrideGuard(StaffAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProblemsController>(ProblemsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

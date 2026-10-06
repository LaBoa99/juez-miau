import { Test, TestingModule } from '@nestjs/testing';
import { EditionProblemsController } from './edition-problems.controller.js';
import { ProblemsService } from '../services/problems.service.js';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard.js';

describe('EditionProblemsController', () => {
  let controller: EditionProblemsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EditionProblemsController],
      providers: [{ provide: ProblemsService, useValue: {} }],
    })
      .overrideGuard(StaffAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EditionProblemsController>(EditionProblemsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

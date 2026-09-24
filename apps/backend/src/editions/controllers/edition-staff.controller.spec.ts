import { Test, TestingModule } from '@nestjs/testing';
import { EditionStaffController } from './edition-staff.controller.js';
import { EditionStaffService } from '../services/edition-staff.service.js';

describe('EditionStaffController', () => {
  let controller: EditionStaffController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EditionStaffController],
      providers: [{ provide: EditionStaffService, useValue: {} }],
    }).compile();

    controller = module.get<EditionStaffController>(EditionStaffController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

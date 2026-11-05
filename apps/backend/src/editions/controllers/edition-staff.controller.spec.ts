import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { EditionStaffController } from './edition-staff.controller.js';
import { EditionStaffService } from '../services/edition-staff.service.js';
import { StaffRole } from '@concurso/shared-types';

describe('EditionStaffController', () => {
  let controller: EditionStaffController;
  const service = { updateRole: vi.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EditionStaffController],
      providers: [{ provide: EditionStaffService, useValue: service }],
    }).compile();

    controller = module.get<EditionStaffController>(EditionStaffController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('cambia el rol de un staff asignado', async () => {
    service.updateRole.mockResolvedValue({ edition_id: 1, staff_user_id: 2, role: StaffRole.OBSERVER });
    await controller.updateStaffRole(1, 2, { role: StaffRole.OBSERVER });
    expect(service.updateRole).toHaveBeenCalledWith(1, 2, StaffRole.OBSERVER);
  });
});

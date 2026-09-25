import { Test, TestingModule } from '@nestjs/testing';
import { EditionTeamsController } from './edition-teams.controller.js';
import { EditionTeamsService } from '../services/edition-teams.service.js';

describe('EditionTeamsController', () => {
  let controller: EditionTeamsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EditionTeamsController],
      providers: [{ provide: EditionTeamsService, useValue: {} }],
    }).compile();

    controller = module.get<EditionTeamsController>(EditionTeamsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

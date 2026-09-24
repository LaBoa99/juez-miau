import { Test, TestingModule } from '@nestjs/testing';
import { EditionCategoriesController } from './edition-categories.controller.js';
import { EditionCategoriesService } from '../services/edition-categories.service.js';

describe('EditionCategoriesController', () => {
  let controller: EditionCategoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EditionCategoriesController],
      providers: [{ provide: EditionCategoriesService, useValue: {} }],
    }).compile();

    controller = module.get<EditionCategoriesController>(EditionCategoriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

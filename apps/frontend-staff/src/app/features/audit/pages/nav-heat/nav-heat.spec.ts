import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { INavCount } from '@concurso/shared-types';
import { NavHeat } from './nav-heat';
import { AuditService } from '../../data/audit.service';
import { EditionsService } from '../../../editions/data/editions.service';

const A = 'aaaaaaaa-0000-4000-8000-000000000000';
const B = 'bbbbbbbb-0000-4000-8000-000000000000';
const counts: INavCount[] = [
  { role: 'judge', from: null, to: 'envios', session: A, count: 1 },
  { role: 'judge', from: 'envios', to: 'problemas', session: A, count: 5 },
  { role: 'judge', from: 'problemas', to: 'envios', session: A, count: 2 },
  { role: 'judge', from: 'problemas', to: 'aclaraciones', session: B, count: 2 },
  { role: 'admin', from: 'concurso', to: 'envios', session: null, count: 4 },
];

// Idas y vueltas (A↔B) y pestañas anónimas de la prueba de calor
describe('oj-nav-heat', () => {
  const setup = () => {
    TestBed.resetTestingModule().configureTestingModule({
      providers: [
        { provide: AuditService, useValue: { navCounts: () => of(counts) } },
        { provide: EditionsService, useValue: { list: () => of([]) } },
      ],
    });
    return TestBed.createComponent(NavHeat).componentInstance;
  };

  it('suma los dos sentidos por par, sin la entrada, con su distancia en la barra', () => {
    const { top, adjacentShare } = setup()['pairs']();
    expect(top).toEqual([
      { a: 'Problemas', b: 'Envíos', ab: 2, ba: 5, total: 7, distance: 2 },
      { a: 'Concurso', b: 'Envíos', ab: 4, ba: 0, total: 4, distance: 1 },
      { a: 'Problemas', b: 'Aclaraciones', ab: 2, ba: 0, total: 2, distance: 6 },
    ]);
    expect(adjacentShare).toBeCloseTo(4 / 13);
  });

  it('cuenta las pestañas, cuánto concentra la más activa, y filtra por una', () => {
    const page = setup();
    expect(page['sessionSummary']()).toEqual({ sessions: 2, topShare: 0.8, untracked: 4 });
    expect(page['sessionList']()[0].label).toBe('Pestaña 1 · Juez · 8 clics');
    page['sessionCtrl'].setValue(B);
    expect(page['total']()).toBe(2);
    expect(page['pairs']().top.map((p) => p.total)).toEqual([2]);
  });
});

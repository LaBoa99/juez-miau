import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { IRoomListItem, ITeamImportValidation } from '@concurso/shared-types';
import { TeamImport } from './team-import';
import { TeamsService } from '../../data/teams.service';

const cat = (id: number, name: string) => ({ id, code: name.slice(0, 3).toUpperCase(), name });
const room = (id: number, categories: ReturnType<typeof cat>[]): IRoomListItem => ({ id, edition_id: 1, name: 'S' + id, observers: [], categories });
const validation = (...categories: ReturnType<typeof cat>[]): ITeamImportValidation => ({
  validRows: categories.length,
  errors: [],
  preview: categories.map((category, i) => ({ row: i + 2, teamName: 'E' + i, category, members: [], action: 'create' })),
});

// Aviso de equipos que quedarían sin salón al importar
describe('oj-team-import · roomless', () => {
  const setup = (rooms: IRoomListItem[], v: ITeamImportValidation) => {
    TestBed.resetTestingModule().configureTestingModule({ providers: [provideRouter([]), { provide: TeamsService, useValue: {} }] });
    const fixture = TestBed.createComponent(TeamImport);
    fixture.componentRef.setInput('editionId', 1);
    fixture.componentRef.setInput('rooms', rooms);
    fixture.componentInstance['validation'].set(v);
    return fixture.componentInstance['roomless']();
  };
  const basico = cat(1, 'Básico');
  const avanzado = cat(2, 'Avanzado');

  it('con un solo salón no avisa: todos van ahí', () => {
    expect(setup([room(1, [])], validation(basico, avanzado))).toBeNull();
  });

  it('cuenta los equipos cuya categoría no tiene salón', () => {
    expect(setup([room(1, [basico]), room(2, [])], validation(basico, avanzado, avanzado))).toEqual({ teams: 2, categories: 'Avanzado', noRooms: false });
    expect(setup([room(1, [basico]), room(2, [avanzado])], validation(basico, avanzado))).toBeNull();
  });

  it('sin salones, todos quedan sin salón', () => {
    expect(setup([], validation(basico))).toEqual({ teams: 1, categories: 'Básico', noRooms: true });
  });
});

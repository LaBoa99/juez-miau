import type { IStandingsCategory, IStandingsRow } from '@concurso/shared-types';
import { filterByRoom } from './room-filter';

const row = (teamId: number, rank: number | null, solved: number): IStandingsRow => ({
  rank,
  suspended: rank == null,
  teamId,
  teamName: 'Equipo ' + teamId,
  solved,
  penalty: 0,
  cells: [],
});

const cat: IStandingsCategory = {
  categoryId: 1,
  code: 'BAS',
  name: 'Básico',
  problems: [],
  rows: [row(1, 1, 5), row(2, 2, 4), row(3, 2, 4), row(4, 4, 3), row(5, 5, 1), row(6, null, 0)],
};
const rooms = new Map<number, number | null>([[1, 10], [2, 20], [3, 20], [4, 20], [5, 10], [6, 20]]);

describe('filterByRoom', () => {
  it('sin salón regresa la categoría completa', () => {
    expect(filterByRoom(cat, rooms, null)).toBe(cat);
  });

  it('recalcula posiciones dentro del salón y conserva empates', () => {
    const r = filterByRoom(cat, rooms, 20).rows.map((x) => [x.teamId, x.rank]);
    expect(r).toEqual([[2, 1], [3, 1], [4, 3], [6, null]]);
  });

  it('salón con un hueco de posiciones queda 1, 2', () => {
    const r = filterByRoom(cat, rooms, 10).rows.map((x) => [x.teamId, x.rank]);
    expect(r).toEqual([[1, 1], [5, 2]]);
  });
});

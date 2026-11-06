import { describe, expect, it } from 'vitest';
import { StaffRole } from '@concurso/shared-types';
import { TUTORIALS, tutorialsFor } from './tutorials.data';

const ids = (list: { id: string }[]) => list.map((t) => t.id);

describe('tutorialsFor', () => {
  it('el superadmin ve todos', () => {
    expect(tutorialsFor(true, [])).toEqual(TUTORIALS);
  });

  it('el observador solo ve marcador y alertas', () => {
    expect(ids(tutorialsFor(false, [StaffRole.OBSERVER]))).toEqual(['marcador', 'alertas']);
  });

  it('el juez no ve lo que solo hace el admin ni lo del superadmin', () => {
    const judge = ids(tutorialsFor(false, [StaffRole.JUDGE]));
    expect(judge).toContain('problemas');
    expect(judge).not.toContain('equipos');
    expect(judge).not.toContain('superadmin');
    expect(judge).not.toContain('control');
  });

  it('suma los roles de varias ediciones', () => {
    expect(ids(tutorialsFor(false, [StaffRole.OBSERVER, StaffRole.ADMIN]))).toContain('programar');
  });

  it('sin ediciones asignadas no ve ninguno', () => {
    expect(tutorialsFor(false, [])).toEqual([]);
  });
});

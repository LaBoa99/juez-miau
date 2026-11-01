import { describe, expect, it } from 'vitest';
import { FlagType, IFlag } from '@concurso/shared-types';
import { flagLabel, flagMessage, flagTone } from './flag-display';

function flag(type: FlagType, details: string): IFlag {
  return {
    id: 1,
    editionId: 1,
    teamId: 1,
    type,
    details,
    createdAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
  };
}

describe('flag-display', () => {
  it('etiqueta y color por tipo', () => {
    expect(flagLabel(FlagType.FORBIDDEN_PROCESS)).toBe('PROGRAMA PROHIBIDO');
    expect(flagTone(FlagType.FORBIDDEN_PROCESS)).toBe('danger');
    expect(flagTone(FlagType.SESSION_REPLACED)).toBe('danger');
    expect(flagTone(FlagType.HEARTBEAT_LOST)).toBe('warning');
    expect(flagTone(FlagType.MANUAL)).toBe('neutral');
  });

  it('saca el nombre del proceso prohibido', () => {
    expect(flagMessage(flag(FlagType.FORBIDDEN_PROCESS, 'Proceso prohibido en ejecución: chrome.exe'))).toBe(
      'Se detectó un programa no permitido abierto: chrome.exe',
    );
  });

  it('quita el sufijo de staff en las manuales', () => {
    expect(flagMessage(flag(FlagType.MANUAL, 'El equipo usó su celular (staff #7)'))).toBe(
      'El equipo usó su celular',
    );
  });

  it('mensajes sencillos para señal y sesión, sin datos técnicos', () => {
    const session = flagMessage(flag(FlagType.SESSION_REPLACED, 'Inició sesión en otra máquina: A → B'));
    const lost = flagMessage(flag(FlagType.HEARTBEAT_LOST, 'Sin heartbeat desde 2026-10-31T00:00:00.000Z'));
    expect(session).not.toContain('→');
    expect(lost).not.toContain('2026');
  });
});

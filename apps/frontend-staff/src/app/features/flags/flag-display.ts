import { FlagType, IFlag } from '@concurso/shared-types';

// Presentación de una alerta en español. El backend ya manda `details` en español, pero con
// datos técnicos (machine ids, fecha ISO, el sufijo "(staff #id)"); aquí se arma el mensaje en
// lenguaje sencillo y la etiqueta/color por tipo.

export type FlagTone = 'danger' | 'warning' | 'neutral';

export function flagLabel(type: FlagType): string {
  switch (type) {
    case FlagType.FORBIDDEN_PROCESS:
      return 'PROGRAMA PROHIBIDO';
    case FlagType.SESSION_REPLACED:
      return 'SESIÓN EN OTRA MÁQUINA';
    case FlagType.HEARTBEAT_LOST:
      return 'SIN SEÑAL';
    case FlagType.MANUAL:
      return 'MANUAL';
  }
}

// Color del borde de la tarjeta. Las resueltas las pinta la página en gris claro, no este color.
export function flagTone(type: FlagType): FlagTone {
  switch (type) {
    case FlagType.FORBIDDEN_PROCESS:
    case FlagType.SESSION_REPLACED:
      return 'danger';
    case FlagType.HEARTBEAT_LOST:
      return 'warning';
    case FlagType.MANUAL:
      return 'neutral';
  }
}

export function flagMessage(flag: IFlag): string {
  switch (flag.type) {
    case FlagType.FORBIDDEN_PROCESS: {
      const name = afterColon(flag.details);
      return name
        ? `Se detectó un programa no permitido abierto: ${name}`
        : 'Se detectó un programa no permitido en el equipo.';
    }
    case FlagType.SESSION_REPLACED:
      return 'El equipo inició sesión desde otra máquina mientras el concurso estaba en curso.';
    case FlagType.HEARTBEAT_LOST:
      return 'El equipo dejó de reportar actividad: se perdió la señal de su cliente.';
    case FlagType.MANUAL:
      return stripStaffTag(flag.details) || 'Alerta levantada por el staff.';
  }
}

function afterColon(s: string): string {
  const i = s.lastIndexOf(':');
  return i >= 0 ? s.slice(i + 1).trim() : '';
}

// Quita el sufijo " (staff #N)" que el backend agrega a las alertas manuales.
function stripStaffTag(s: string): string {
  return s.replace(/\s*\(staff #\d+\)\s*$/, '').trim();
}

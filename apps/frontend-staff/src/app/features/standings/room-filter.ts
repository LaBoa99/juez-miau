import type { IStandingsCategory, IStandingsRow } from '@concurso/shared-types';

// Marcador de una categoría solo con los equipos de un salón. El orden es el del backend; la
// posición se recalcula dentro del salón y los empates (misma posición en el backend) se conservan.
export function filterByRoom(
  cat: IStandingsCategory,
  roomOf: ReadonlyMap<number, number | null>,
  roomId: number | null,
): IStandingsCategory {
  if (roomId == null) return cat;
  const rows: IStandingsRow[] = [];
  let place = 0;
  // Último equipo con lugar: su posición en el backend y la nueva dentro del salón
  let prev: { backendRank: number; rank: number } | null = null;
  for (const row of cat.rows) {
    if ((roomOf.get(row.teamId) ?? null) !== roomId) continue;
    if (row.rank == null) {
      rows.push(row); // suspendido: sin lugar
      continue;
    }
    place++;
    const rank: number = prev?.backendRank === row.rank ? prev.rank : place;
    prev = { backendRank: row.rank, rank };
    rows.push({ ...row, rank });
  }
  return { ...cat, rows };
}

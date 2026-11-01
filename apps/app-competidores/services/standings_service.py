class StandingsService:
    def __init__(self, api):
        self.api = api

    def load(self, edition_id):
        """IStandings público: el mismo que se proyecta, congelado al final."""
        return self.api.get(f"/public/editions/{edition_id}/standings")


def category_of(standings, category_id):
    """Solo la categoría del equipo; el backend manda todas."""
    return next((c for c in standings["categories"] if c["categoryId"] == category_id), None)


def cell_text(cell):
    """Celda estilo ICPC: minuto del AC y rechazos previos, rechazos sin AC, o pendientes."""
    if cell["solved"]:
        tries = f" (+{cell['rejected']})" if cell["rejected"] else ""
        return f"{cell['acMinute']}′{tries}"
    parts = []
    if cell["rejected"]:
        parts.append(f"−{cell['rejected']}")
    if cell["pending"]:
        parts.append(f"? {cell['pending']}")
    return "  ".join(parts) or "-"

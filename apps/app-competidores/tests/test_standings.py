from services.standings_service import category_of, cell_text


def cell(solved=False, rejected=0, ac=None, pending=0):
    return {"problemId": 1, "solved": solved, "rejected": rejected, "acMinute": ac, "firstToSolve": False, "pending": pending}


def test_category_of_filters_team_category():
    standings = {"categories": [{"categoryId": 5, "name": "PRIN"}, {"categoryId": 6, "name": "AVAN"}]}
    assert category_of(standings, 6)["name"] == "AVAN"
    assert category_of(standings, 7) is None


def test_cell_text_icpc_style():
    assert cell_text(cell()) == "-"
    assert cell_text(cell(solved=True, ac=42)) == "42′"
    assert cell_text(cell(solved=True, ac=42, rejected=2)) == "42′ (+2)"
    assert cell_text(cell(rejected=3)) == "−3"
    assert cell_text(cell(rejected=1, pending=2)) == "−1  ? 2"

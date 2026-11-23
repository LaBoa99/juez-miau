import re

from PySide6.QtGui import (
    QColor, QFont, QTextCharFormat, QTextCursor, QTextFrameFormat, QTextLength, QTextTableFormat,
)

from views.style import BORDER, MONO, SM


def case_input_text(json_text):
    """Presentación de la entrada de un ejemplo: llega como JSON canónico ({"nums":[2,7],"k":9}) y se
    muestra un parámetro por línea ("nums = [2, 7]", "k = 9"), sin la estructura JSON. Se corta el
    texto en vez de parsearlo para no perder precisión en los long."""
    text = json_text.strip()
    if not (text.startswith("{") and text.endswith("}")):
        return json_text
    parts, depth, in_string, start, body, i = [], 0, False, 0, text[1:-1], 0
    while i < len(body):
        ch = body[i]
        if in_string:
            if ch == "\\":
                i += 1
            elif ch == '"':
                in_string = False
        elif ch == '"':
            in_string = True
        elif ch in "[{":
            depth += 1
        elif ch in "]}":
            depth -= 1
        elif ch == "," and depth == 0:
            parts.append(body[start:i])
            start = i + 1
        i += 1
    if body[start:].strip():
        parts.append(body[start:])
    lines = []
    for part in parts:
        match = re.match(r'\s*"((?:[^"\\]|\\.)*)"\s*:\s*(.*)$', part, re.S)
        if not match:
            return json_text
        lines.append(f"{match.group(1)} = {spaced(match.group(2).strip())}")
    return "\n".join(lines)


def spaced(text):
    """Un espacio tras cada coma fuera de las cadenas ([2,7] → [2, 7]): así una lista larga corta la línea
    entre números y no a la mitad de uno."""
    out, in_string, escaped = [], False, False
    for ch in text:
        out.append(ch)
        if escaped:
            escaped = False
        elif in_string and ch == "\\":
            escaped = True
        elif ch == '"':
            in_string = not in_string
        elif ch == "," and not in_string:
            out.append(" ")
    return "".join(out)


def case_text(text):
    """Salida de un caso: las listas y objetos JSON van espaciados; el texto de programa completo, tal cual."""
    return spaced(text) if text.lstrip()[:1] in ("[", "{") else text


def insert_example(cursor, input_text, output_text):
    """Un ejemplo del enunciado: tabla con borde fino y sin fondo, una columna Entrada y otra Salida, con los
    títulos en negritas y los valores en monoespaciada."""
    fmt = QTextTableFormat()
    fmt.setBorderStyle(QTextFrameFormat.BorderStyle.BorderStyle_Solid)
    fmt.setBorderBrush(QColor(BORDER))
    fmt.setBorder(1)
    fmt.setBorderCollapse(True)
    fmt.setCellSpacing(0)
    fmt.setCellPadding(SM)
    fmt.setBottomMargin(SM)
    fmt.setWidth(QTextLength(QTextLength.Type.PercentageLength, 100))
    fmt.setColumnWidthConstraints([QTextLength(QTextLength.Type.PercentageLength, 50)] * 2)
    table = cursor.insertTable(2, 2, fmt)  # va justo después del encabezado, sin párrafo vacío en medio
    label = QTextCharFormat()
    label.setFontWeight(QFont.Weight.DemiBold)
    mono = QTextCharFormat()
    mono.setFontFamilies(list(MONO))
    mono.setFontStyleHint(QFont.StyleHint.Monospace)
    mono.setFontFixedPitch(True)
    for column, (title, value) in enumerate((("Entrada", input_text), ("Salida", output_text))):
        table.cellAt(0, column).firstCursorPosition().insertText(title, label)
        table.cellAt(1, column).firstCursorPosition().insertText(value, mono)

    cursor.movePosition(QTextCursor.MoveOperation.End)

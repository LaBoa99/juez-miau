# Escala de espacios con base 4: grupos apretados (4/8) y separación generosa (16/24).
XS, SM, MD, LG = 4, 8, 16, 24

# Colores de referencia del diseño de Stitch
SURFACE = "#ffffff"
PANEL = "#f0f3ff"
PANEL_HOVER = "#e7eefe"
SELECTED = "#dce2f3"
TEXT = "#151c27"
TEXT_MUTED = "#45464c"
BORDER = "#c6c6cd"
PRIMARY = "#000000"
PRIMARY_HOVER = "#2a313d"
ACCENT = "#006c4a"
SELECTION = "#85f8c4"
ERROR = "#ba1a1a"

def apply_theme(app):
    """Siempre claro, aunque el sistema use tema oscuro: Fusion + paleta propia + QSS."""
    from PySide6.QtCore import Qt
    from PySide6.QtGui import QColor, QPalette

    app.styleHints().setColorScheme(Qt.ColorScheme.Light)
    app.setStyle("Fusion")
    role = QPalette.ColorRole
    palette = QPalette()
    for r, color in (
        (role.Window, SURFACE), (role.WindowText, TEXT), (role.Base, SURFACE), (role.AlternateBase, PANEL),
        (role.Text, TEXT), (role.Button, SURFACE), (role.ButtonText, TEXT), (role.BrightText, ERROR),
        (role.Highlight, SELECTED), (role.HighlightedText, TEXT), (role.ToolTipBase, SURFACE),
        (role.ToolTipText, TEXT), (role.PlaceholderText, TEXT_MUTED), (role.Link, ACCENT),
        (role.Light, SURFACE), (role.Midlight, PANEL), (role.Mid, BORDER), (role.Dark, BORDER), (role.Shadow, TEXT_MUTED),
    ):
        palette.setColor(r, QColor(color))
    for r in (role.WindowText, role.Text, role.ButtonText):
        palette.setColor(QPalette.ColorGroup.Disabled, r, QColor(TEXT_MUTED))
    app.setPalette(palette)
    app.setStyleSheet(STYLE)


STYLE = f"""
QWidget {{ color: {TEXT}; font-size: 10pt; }}
QMainWindow, QDialog, #detail, #login {{ background: {SURFACE}; }}
QLabel#title {{ font-size: 15pt; font-weight: 600; }}
QLabel#muted {{ color: {TEXT_MUTED}; }}
QLabel#error {{ color: {ERROR}; }}
QLabel#section {{ font-weight: 600; }}

#sidebarPanel {{ background: {PANEL}; border-right: 1px solid {BORDER}; }}
QLabel#clock {{ font-size: 20pt; font-weight: 600; font-family: "JetBrains Mono", "Consolas", monospace; }}
QListWidget#sidebar {{
    background: transparent; border: none;
    outline: 0; padding: {SM}px 0;
}}
QListWidget#sidebar::item {{ padding: {SM}px {MD}px; border: none; }}
QListWidget#sidebar::item:hover {{ background: {PANEL_HOVER}; }}
QListWidget#sidebar::item:selected {{ background: {SELECTED}; color: {TEXT}; }}

QLineEdit {{
    padding: 6px {SM}px; border: 1px solid {BORDER}; border-radius: 4px;
    background: {SURFACE}; selection-background-color: {SELECTION}; selection-color: {TEXT};
}}
QLineEdit:focus {{ border-color: {ACCENT}; }}

QPushButton {{
    padding: 6px {MD}px; border-radius: 4px; border: 2px solid {PRIMARY};
    background: {PRIMARY}; color: #ffffff; font-weight: 600;
}}
QPushButton:hover {{ background: {PRIMARY_HOVER}; border-color: {PRIMARY_HOVER}; }}
QPushButton:focus {{ border-color: {ACCENT}; }}
QPushButton:disabled {{ background: {BORDER}; border-color: {BORDER}; color: {TEXT_MUTED}; }}
QPushButton#secondary {{ background: {SURFACE}; color: {TEXT}; border: 1px solid {BORDER}; }}
QPushButton#secondary:hover {{ background: {PANEL}; }}
QPushButton#secondary:focus {{ border-color: {ACCENT}; }}

QComboBox {{ padding: 5px {SM}px; border: 1px solid {BORDER}; border-radius: 4px; background: {SURFACE}; }}
QComboBox:focus {{ border-color: {ACCENT}; }}
QComboBox QAbstractItemView {{
    background: {SURFACE}; color: {TEXT}; border: 1px solid {BORDER};
    selection-background-color: {SELECTED}; selection-color: {TEXT}; outline: 0;
}}
QCheckBox {{ spacing: {SM}px; }}

QTableWidget {{
    border: none; background: {SURFACE}; alternate-background-color: {PANEL};
    selection-background-color: {SELECTED}; selection-color: {TEXT};
}}
QTableWidget::item {{ padding: {XS}px {SM}px; }}
QHeaderView::section {{
    background: {SURFACE}; color: {TEXT_MUTED}; border: none; border-bottom: 1px solid {BORDER};
    padding: {XS}px {SM}px; font-weight: 600;
}}
QPlainTextEdit {{ border: none; background: {PANEL}; padding: {SM}px; }}

QTextBrowser {{
    border: none; background: {SURFACE};
    selection-background-color: {SELECTION}; selection-color: {TEXT};
}}
#topbar {{ background: {SURFACE}; border-bottom: 1px solid {BORDER}; min-height: 36px; }}
QPushButton#topbarButton {{ background: transparent; color: {TEXT_MUTED}; border: none; padding: {SM}px {MD}px; font-weight: 600; }}
QPushButton#topbarButton:hover {{ color: {TEXT}; background: {PANEL}; }}
QPushButton#topbarButton:focus {{ color: {TEXT}; }}

QTabBar {{ background: transparent; }}
QTabBar::tab {{
    padding: {SM}px {MD}px; border: none; border-bottom: 2px solid transparent;
    color: {TEXT_MUTED}; background: {SURFACE}; font-weight: 600;
}}
QTabBar::tab:selected {{ color: {TEXT}; border-bottom-color: {PRIMARY}; }}
QTabBar::tab:hover {{ color: {TEXT}; }}

QStatusBar {{ background: {PANEL}; color: {TEXT_MUTED}; border-top: 1px solid {BORDER}; }}
QStatusBar::item {{ border: none; }}
"""

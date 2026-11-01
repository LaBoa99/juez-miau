import sys
from pathlib import Path

# Los módulos de la app se importan desde la raíz de apps/app-competidores
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

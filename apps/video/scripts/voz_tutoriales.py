"""Voz de los tutoriales: por cada src/tutoriales/<id>.json genera public/tutoriales/<id>/00.mp3 (el título)
y NN.mp3 (cada paso), y guarda en el JSON cuántos cuadros dura cada audio ("frames" / "tituloFrames").

Uso:  <python con edge-tts> scripts/voz_tutoriales.py [id ...]     (sin ids: todos; necesita ffmpeg)
"""
import asyncio
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from voz import CHAIN, FPS, duration, segments, synth

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "tutoriales"


def say(text: str, dest: Path, tmp: Path) -> int:
    """Escribe el mp3 recortado y normalizado como en el video del sitio; devuelve su duración en cuadros."""
    raw = tmp / "raw.mp3"
    words = asyncio.run(synth(text, raw))
    segs = segments(words, duration(raw))
    parts = "".join(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS[s{i}];" for i, (a, b) in enumerate(segs))
    graph = parts + "".join(f"[s{i}]" for i in range(len(segs))) + f"concat=n={len(segs)}:v=0:a=1,{CHAIN}"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-filter_complex", graph,
         "-ar", "44100", "-ac", "1", "-b:a", "128k", str(dest)],
        check=True,
    )
    return round(duration(dest) * FPS)


def main() -> None:
    ids = sys.argv[1:] or sorted(p.stem for p in DATA.glob("*.json"))
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        for id_ in ids:
            path = DATA / f"{id_}.json"
            data = json.loads(path.read_text(encoding="utf-8"))
            out = ROOT / "public" / "tutoriales" / id_
            data["tituloFrames"] = say(data["titulo"], out / "00.mp3", tmp)
            for paso in data["pasos"]:
                paso["frames"] = say(paso["voz"], out / paso["img"].replace(".png", ".mp3"), tmp)
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            total = sum(p["frames"] for p in data["pasos"]) / FPS
            print(f"{id_}: {len(data['pasos'])} pasos, {total:.0f} s de voz")


if __name__ == "__main__":
    main()

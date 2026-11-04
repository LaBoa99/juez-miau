"""Genera la voz de la narradora (public/voz/<id>.mp3) a partir de src/voz.json
y guarda en ese mismo JSON cuántos cuadros dura cada frase y en qué cuadro empieza.

Las frases con "sync": {"word": "...", "frame": N} se acomodan para que esa palabra
se oiga justo en el cuadro N; las demás conservan su "at".

Uso:  <python con edge-tts> scripts/voz.py      (necesita edge-tts >= 7 y ffmpeg)
"""
import asyncio
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
LINES = ROOT / "src" / "voz.json"
OUT = ROOT / "public" / "voz"
FPS = 30
DURATION = 90 * FPS
VOICE = "es-MX-DaliaNeural"
RATE = "+5%"

LEAD, TAIL = 0.08, 0.3  # aire antes de la primera palabra y después de la última
LONG_GAP, SHORT_GAP = 0.8, 0.55  # pausas más largas que LONG_GAP se acortan a SHORT_GAP
CHAIN = "highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,loudnorm=I=-16:TP=-1.5"


async def synth(text: str, dest: Path) -> list[tuple[float, float, str]]:
    """Escribe el mp3 y devuelve (inicio, fin, palabra) en segundos."""
    for attempt in range(3):  # el servicio de voz a veces corta la conexión
        try:
            words, audio = [], bytearray()
            async for chunk in edge_tts.Communicate(text, VOICE, rate=RATE, boundary="WordBoundary").stream():
                if chunk["type"] == "audio":
                    audio += chunk["data"]
                elif chunk["type"] == "WordBoundary":
                    start = chunk["offset"] / 1e7
                    words.append((start, start + chunk["duration"] / 1e7, chunk["text"]))
            dest.write_bytes(audio)
            return words
        except Exception as e:  # noqa: BLE001
            if attempt == 2:
                sys.exit(f"No se pudo generar «{text}»: {e}")
    raise AssertionError


def segments(words: list[tuple[float, float, str]], length: float) -> list[tuple[float, float]]:
    """Tramos a conservar: recorte por palabras y pausas largas acortadas (40 % antes, 60 % después)."""
    segs = [[max(0.0, words[0][0] - LEAD), None]]
    for (_, end, _), (start, _, _) in zip(words, words[1:]):
        if start - end > LONG_GAP:
            segs[-1][1] = end + SHORT_GAP * 0.4
            segs.append([start - SHORT_GAP * 0.6, None])
    segs[-1][1] = min(length, words[-1][1] + TAIL)
    return [(a, b) for a, b in segs]


def remap(t: float, segs: list[tuple[float, float]]) -> float:
    """Dónde queda el instante t del audio original después de recortar."""
    out = 0.0
    for a, b in segs:
        if t < b:
            return out + max(0.0, t - a)
        out += b - a
    return out


def clean(w: str) -> str:
    return w.strip("¡!¿?.,;:… ").lower()


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    )
    return float(out.stdout)


def main() -> None:
    lines = json.loads(LINES.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for line in lines:
            raw = Path(tmp) / f"{line['id']}.mp3"
            words = asyncio.run(synth(line["say"], raw))
            segs = segments(words, duration(raw))
            parts = "".join(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS[s{i}];" for i, (a, b) in enumerate(segs))
            graph = parts + "".join(f"[s{i}]" for i in range(len(segs))) + f"concat=n={len(segs)}:v=0:a=1,{CHAIN}"
            dest = OUT / f"{line['id']}.mp3"
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-filter_complex", graph,
                 "-ar", "44100", "-ac", "1", "-b:a", "128k", str(dest)],
                check=True,
            )
            line["frames"] = round(duration(dest) * FPS)
            # Cuadro de cada palabra, relativo al inicio de la frase (el conteo 3-2-1 se sincroniza con esto).
            line["words"] = [[round(remap(w[0], segs) * FPS), w[2]] for w in words]
            if sync := line.get("sync"):
                hit = next((w for w in words if clean(w[2]) == clean(sync["word"])), None)
                if hit is None:
                    sys.exit(f"La frase {line['id']} no dice «{sync['word']}»: {[w[2] for w in words]}")
                line["at"] = sync["frame"] - round(remap(hit[0], segs) * FPS)
            print(f"{line['id']}  cuadro {line['at']:4}  {line['frames'] / FPS:4.1f} s  {line['text']}")

    for a, b in zip(lines, lines[1:]):
        end = a["at"] + a["frames"]
        if end > b["at"]:
            print(f"AVISO: la frase {a['id']} termina en el cuadro {end} y la {b['id']} empieza en {b['at']}", file=sys.stderr)
    if lines[-1]["at"] + lines[-1]["frames"] > DURATION:
        print(f"AVISO: la última frase pasa del final del video ({DURATION})", file=sys.stderr)
    LINES.write_text(json.dumps(lines, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

"""Split a character sheet into its views (spec 4.1 step 1).

Usage:  python tools/crop_reference.py egbon-razak [front three_quarter side back]

Reads reference/<id>-sheet.png, finds the figures by looking for columns that are not the flat
background colour, and writes into assets-src/<id>/:
  - <view>.png         each figure, tightly cropped with a margin
  - front-square.png   the front view centred on a 1024x1024 canvas of the sheet's background
                       colour: this is the picture to give an image-to-3D tool
  - views.json         the pixel box of every view, so the crops can be checked or redone
"""

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TOLERANCE = 28      # how far (per channel) a pixel may be from the background and still count as background
MIN_GAP = 12        # background columns needed between two figures
MARGIN = 24


def background(im: Image.Image) -> tuple:
    """The sheet's flat background: the most common colour along the border."""
    w, h = im.size
    px = im.load()
    counts = {}
    sums = {}
    for x in range(0, w, 4):
        for y in (2, h - 3):
            c = px[x, y][:3]
            k = tuple(v // 8 for v in c)
            counts[k] = counts.get(k, 0) + 1
            s = sums.setdefault(k, [0, 0, 0])
            for i in range(3):
                s[i] += c[i]
    k = max(counts, key=counts.get)
    # the average of the most common shade, so padding matches the sheet exactly
    return tuple(round(v / counts[k]) for v in sums[k])


def is_bg(c, bg) -> bool:
    return all(abs(a - b) <= TOLERANCE for a, b in zip(c[:3], bg))


def find_spans(flags, min_gap):
    """Runs of True in a list of booleans, joining runs separated by fewer than min_gap Falses."""
    spans = []
    start = None
    gap = 0
    for i, f in enumerate(flags):
        if f:
            if start is None:
                start = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                spans.append((start, i - gap + 1))
                start = None
                gap = 0
    if start is not None:
        spans.append((start, len(flags)))
    return spans


def main() -> None:
    char_id = sys.argv[1] if len(sys.argv) > 1 else 'egbon-razak'
    names = sys.argv[2:] or ['front', 'three_quarter', 'side', 'back']
    sheet = ROOT / 'reference' / f'{char_id}-sheet.png'
    alt = ROOT / 'reference' / f'{char_id.split("-")[0]}-sheet.png'
    src = sheet if sheet.exists() else alt
    im = Image.open(src).convert('RGB')
    w, h = im.size
    bg = background(im)
    px = im.load()
    cols = [sum(0 if is_bg(px[x, y], bg) else 1 for y in range(0, h, 3)) > 3 for x in range(w)]
    spans = [s for s in find_spans(cols, MIN_GAP) if s[1] - s[0] > 40]
    if len(spans) != len(names):
        print(f'found {len(spans)} figures {spans}, expected {len(names)}: pass the view names that match')
    out = ROOT / 'assets-src' / char_id
    out.mkdir(parents=True, exist_ok=True)
    boxes = {}
    for name, (x0, x1) in zip(names, spans):
        rows = [any(not is_bg(px[x, y], bg) for x in range(x0, x1, 2)) for y in range(h)]
        ys = [y for y, r in enumerate(rows) if r]
        y0, y1 = ys[0], ys[-1] + 1
        box = (max(0, x0 - MARGIN), max(0, y0 - MARGIN), min(w, x1 + MARGIN), min(h, y1 + MARGIN))
        boxes[name] = box
        im.crop(box).save(out / f'{name}.png')
    if 'front' in boxes:
        crop = im.crop(boxes['front'])
        scale = 960 / max(crop.size)
        crop = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS)
        square = Image.new('RGB', (1024, 1024), bg)
        square.paste(crop, ((1024 - crop.width) // 2, (1024 - crop.height) // 2))
        square.save(out / 'front-square.png')
    (out / 'views.json').write_text(json.dumps({'sheet': src.name, 'background': bg, 'views': boxes}, indent=2))
    print(f'{char_id}: {len(boxes)} views -> {out}')
    for k, v in boxes.items():
        print(f'  {k}: {v}')


if __name__ == '__main__':
    main()

"""Pack a character's front and back sheet views into one texture for the Blender build (spec 4.1).

Usage:  python tools/make_atlas.py egbon-razak     (after tools/crop_reference.py)

Writes assets-src/<id>/atlas.png (1536 x 1024: front, side and back views side by side) and atlas.json,
which tells the Blender script where each view sits in the atlas: the figure's centre line and sole
line in atlas pixels and how many atlas pixels make one metre. The model is painted by projecting
these views onto it from the front and from behind, so its colours and print come from the sheet.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SIZE = 1024
SLOT = 512
VIEWS = ['front', 'side', 'back']
BLEED = 64  # px the figure's colours are pushed out over the background, so edges never show grey
TOL = 28


def figure_box(im: Image.Image, bg) -> tuple:
    """The tight box around the figure (no margin)."""
    px = im.load()
    w, h = im.size
    def fg(x, y):
        return any(abs(a - b) > TOL for a, b in zip(px[x, y][:3], bg))
    xs = [x for x in range(w) if any(fg(x, y) for y in range(0, h, 2))]
    ys = [y for y in range(h) if any(fg(x, y) for x in range(0, w, 2))]
    return xs[0], ys[0], xs[-1] + 1, ys[-1] + 1


def box_blur(a: np.ndarray, r: int) -> np.ndarray:
    """Box blur over the first two axes (separable, with edge clamping)."""
    out = a
    for axis in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(out, pad, mode='edge'), axis=axis)
        n = out.shape[axis]
        hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
        lo = np.take(c, np.arange(0, n), axis=axis)
        out = (hi - lo) / (2 * r + 1)
    return out


def bleed(im: Image.Image, bg, steps: int) -> Image.Image:
    """Fill the background with smoothly blurred figure colours (texture padding without streaks)."""
    a = np.asarray(im, dtype=np.float32)
    mask = (np.abs(a - np.array(bg, dtype=np.float32)).max(axis=2) > TOL).astype(np.float32)
    out = a.copy()
    filled = mask > 0
    for r in (2, 4, 8, 16, 32, 64):
        m = box_blur(mask, r)
        c = box_blur(a * mask[..., None], r)
        take = (~filled) & (m > 1e-3)
        out[take] = c[take] / m[take][:, None]
        filled |= take
        if r >= steps:
            break
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


def main() -> None:
    char_id = sys.argv[1] if len(sys.argv) > 1 else 'egbon-razak'
    folder = ROOT / 'assets-src' / char_id
    meta = json.loads((folder / 'views.json').read_text())
    bg = tuple(meta['background'])
    data = json.loads((ROOT / 'src' / 'sim' / 'data' / f'{char_id}.json').read_text(encoding='utf-8'))
    height_m = data['height'] / 100.0
    atlas = Image.new('RGB', (SLOT * len(VIEWS), SIZE), bg)
    views = {}
    for i, name in enumerate(VIEWS):
        im = Image.open(folder / f'{name}.png').convert('RGB')
        x0, y0, x1, y1 = figure_box(im, bg)
        fig = im.crop((x0, y0, x1, y1))
        k = min((SIZE - 16) / fig.height, (SLOT - 8) / fig.width)
        fig = fig.resize((round(fig.width * k), round(fig.height * k)), Image.LANCZOS)
        left = i * SLOT + (SLOT - fig.width) // 2
        top = (SIZE - fig.height) // 2
        slot = Image.new('RGB', (SLOT, SIZE), bg)
        slot.paste(fig, (left - i * SLOT, top))
        atlas.paste(bleed(slot, bg, BLEED), (i * SLOT, 0))
        views[name] = {
            'cx': left + fig.width / 2,            # the figure's centre line, atlas px
            'foot': top + fig.height,              # the sole line, atlas px
            'top': top,
            'pxPerM': fig.height / height_m,       # the figure is the character's full height
            'left': left, 'width': fig.width,
        }
    atlas.save(folder / 'atlas.png')
    (folder / 'atlas.json').write_text(json.dumps({'width': atlas.width, 'size': SIZE, 'height': height_m, 'views': views}, indent=2))
    print(json.dumps(views, indent=2))


if __name__ == '__main__':
    main()

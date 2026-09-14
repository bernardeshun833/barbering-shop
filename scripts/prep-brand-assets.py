"""Prepare the shop's photographs and service icons for the app.

Photographs are resized and re-encoded to a weight the tablet can cache and
load on a bad connection. Icons are cut from the supplied grid, keyed off
their tile background and trimmed to their own bounds.
"""

import os

import numpy as np
from PIL import Image

UP = "/root/.claude/uploads/d0418fb5-e6a1-529e-b6c4-b42bb20b92cb"
PUB = "/home/user/barbering-shop/public"

BACKDROP = f"{UP}/033e32e6-image.png"  # barber pole and chair — lock screen
TODAY = f"{UP}/8a99f6b6-image.png"  # chair in the foreground — Today panel
ICONS = f"{UP}/9245e6f7-image.png"  # the six service tiles


def photo(src: str, dest: str, width: int, quality: int) -> None:
    im = Image.open(src).convert("RGB")
    h = round(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS)
    im.save(dest, "JPEG", quality=quality, optimize=True, progressive=True)
    print(os.path.basename(dest), im.size, f"{os.path.getsize(dest)//1024}KB")


photo(BACKDROP, f"{PUB}/backdrop.jpg", 900, 70)
photo(TODAY, f"{PUB}/today.jpg", 900, 70)


# ---- service icons ---------------------------------------------------------

grid = Image.open(ICONS).convert("RGB")
g = np.asarray(grid).astype(np.float32)
lum = g.max(axis=2)

# The tiles sit on a darker page background. Averaging brightness down the
# columns and across the rows finds the gutters between them without
# hard-coding pixel positions.
col_mean = lum.mean(axis=0)
row_mean = lum.mean(axis=1)


def darkest_between(profile: np.ndarray, lo: float, hi: float) -> int:
    """Darkest row/column in a band — the gap between two tiles.

    Searching inside the band the gap is known to fall in, rather than taking
    the darkest runs overall, which finds the page margins instead.
    """
    a, b = int(len(profile) * lo), int(len(profile) * hi)
    return a + int(np.argmin(profile[a:b]))


# A 2 x 3 grid: one gutter down the middle, two across the thirds.
v_gut = [darkest_between(col_mean, 0.40, 0.60)]
h_gut = [
    darkest_between(row_mean, 0.28, 0.40),
    darkest_between(row_mean, 0.60, 0.72),
]
print("column gutter:", v_gut, "row gutters:", h_gut)

xs = [0] + v_gut + [grid.width]
ys = [0] + h_gut + [grid.height]

# Row order in the supplied grid.
NAMES = [
    ["haircut", "haircut-beard"],
    ["beard-trim", "shave"],
    ["kids-cut", "line-up"],
]

LO, HI = 38.0, 130.0
os.makedirs(f"{PUB}/icons", exist_ok=True)

for r in range(3):
    for c in range(2):
        cell = grid.crop((xs[c], ys[r], xs[c + 1], ys[r + 1]))
        # Inset past the tile's own gold hairline border, which is the same
        # colour as the glyph and would otherwise survive the key and define
        # the bounding box.
        inset = 12
        cell = cell.crop(
            (inset, inset, cell.width - inset, int(cell.height * 0.45))
        )

        a = np.asarray(cell.convert("RGB")).astype(np.float32)
        alpha = np.clip((a.max(axis=2) - LO) / (HI - LO), 0.0, 1.0)
        safe = np.maximum(alpha, 1e-3)[..., None]
        rgba = Image.fromarray(
            np.dstack([np.clip(a / safe, 0, 255), alpha * 255.0]).astype(np.uint8), "RGBA"
        )

        # Bounds from a cleaned mask rather than getbbox(): a single surviving
        # speck from the tile's rounded corner would otherwise stretch the box
        # across the whole cell and shrink the glyph to a dot.
        mask = alpha > 0.35

        def main_run(counts: np.ndarray) -> np.ndarray:
            """The heaviest contiguous band of content.

            Corner residue from the tile survives the key as one or two faint
            pixels at the far edge; taking outright min/max would stretch the
            box out to meet it, so the glyph's own band is chosen by mass.
            """
            present = counts > 0
            runs, start = [], None
            for i, p in enumerate(present):
                if p and start is None:
                    start = i
                elif not p and start is not None:
                    runs.append((start, i))
                    start = None
            if start is not None:
                runs.append((start, len(present)))
            if not runs:
                return np.array([], dtype=int)
            best = max(runs, key=lambda r: counts[r[0] : r[1]].sum())
            return np.arange(best[0], best[1])

        cols = main_run(mask.sum(axis=0))
        rows = main_run(mask.sum(axis=1))
        if len(cols) and len(rows):
            pad = 2
            rgba = rgba.crop(
                (
                    max(int(cols[0]) - pad, 0),
                    max(int(rows[0]) - pad, 0),
                    min(int(cols[-1]) + 1 + pad, rgba.width),
                    min(int(rows[-1]) + 1 + pad, rgba.height),
                )
            )

        # Square canvas so every tile's icon sits on the same optical centre.
        side = max(rgba.size)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(rgba, ((side - rgba.width) // 2, (side - rgba.height) // 2))
        canvas = canvas.resize((128, 128), Image.LANCZOS)

        name = NAMES[r][c]
        # Quantised: these are a gold gradient on transparency, so a palette
        # holds them faithfully at a fraction of the weight. The tablet
        # precaches every one of these for offline use, and first load on a
        # weak connection is the thing that budget protects.
        canvas = canvas.quantize(colors=64, method=Image.FASTOCTREE)
        canvas.save(f"{PUB}/icons/{name}.png", optimize=True)
        print(f"icons/{name}.png", rgba.size, "->", canvas.size,
              f"{os.path.getsize(f'{PUB}/icons/{name}.png')//1024}KB")

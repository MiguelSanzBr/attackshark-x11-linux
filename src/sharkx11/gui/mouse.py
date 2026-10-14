"""The X11 drawn as an outline: body traced from the official top-view render's silhouette (alpha channel only,
``tools/trace_silhouette.py``, 200 units wide), the five remappable buttons as clickable parts, the wheel,
the DPI button and the LED. Logical units, scaled by the UI factor ``s``."""
from .drawing import rounded

WIDTH, HEIGHT = 200, 390
# outline with the two side-button bumps cut off (they are drawn as their own parts)
BODY = [(117, 0), (185, 26), (186, 33), (188, 33), (189, 28), (193, 35), (195, 70), (192, 126), (192, 183),
        (199, 271), (198, 302), (193, 322), (186, 338), (177, 352), (157, 370), (141, 379), (120, 384), (95, 385),
        (71, 381), (48, 369), (28, 350), (15, 326), (9, 305), (7, 283), (9, 228), (9, 128), (7, 75), (8, 37),
        (12, 30), (14, 36), (15, 29), (21, 25), (53, 14), (81, 1), (85, 1), (86, 17), (114, 17), (115, 2)]
SPLIT_Y, CENTER_X = 177, 101                  # where the main buttons end / the line between them
WHEEL = (88, 22, 115, 104)
DPI_BUTTON = (95, 114, 107, 136)
LED = (93, 184, 109, 188)
# part -> polygon (smoothed) or rounded box, and the point a callout points at
PARTS = {
    "left": ([(12, 30), (21, 25), (53, 14), (81, 1), (85, 1), (86, 17), (86, 110), (CENTER_X, 116),
              (CENTER_X, SPLIT_Y), (9, SPLIT_Y), (9, 128), (7, 75), (8, 37)], (45, 80)),
    "right": ([(117, 0), (185, 26), (189, 28), (193, 35), (195, 70), (192, 126), (192, SPLIT_Y),
               (CENTER_X, SPLIT_Y), (CENTER_X, 116), (116, 110), (114, 17), (115, 2)], (155, 80)),
    "middle": (WHEEL, (CENTER_X, 63)),
    "forward": ((0, 132, 10, 163), (5, 147)),
    "back": ((0, 186, 10, 215), (5, 200)),
}
# callouts: part, side, label y
CALLOUTS = [("left", "l", 60), ("forward", "l", 150), ("back", "l", 205), ("middle", "r", 40), ("right", "r", 95)]


def draw(c, s, ox, line, sel_line, fill, on_click):
    """Draw the mouse at x offset ``ox``; returns ``{part: item}``. ``on_click(part)`` runs when a part is clicked."""
    P = lambda *xy: [(v + (ox if i % 2 == 0 else 0)) * s for i, v in enumerate(xy)]
    w = max(1, round(2 * s))
    c.create_polygon(P(*[v for pt in BODY for v in pt]), smooth=True, fill=fill, outline=line, width=w)
    items = {}
    for name, (shape, _pt) in PARTS.items():
        if isinstance(shape, list):
            item = c.create_polygon(P(*[v for pt in shape for v in pt]), smooth=True, fill=fill, outline=line,
                                    width=w, tags=f"part:{name}")
        else:
            item = rounded(c, *P(*shape), 6 * s, fill=fill, outline=line, width=w, tags=f"part:{name}")
        c.tag_bind(f"part:{name}", "<Button-1>", lambda e, n=name: on_click(n))
        items[name] = item
    for y in range(32, 100, 9):                               # wheel grip
        c.create_line(P(92, y, 111, y), fill=sel_line, width=max(1, round(s)))
    rounded(c, *P(*DPI_BUTTON), 5 * s, fill=fill, outline=line, width=w)
    items["led"] = rounded(c, *P(*LED), 2 * s, fill=line, outline="")
    return items

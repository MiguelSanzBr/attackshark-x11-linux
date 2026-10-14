"""Drawing primitives: rounded shapes and colour maths."""
import colorsys

def rr_points(x1, y1, x2, y2, r):
    """Control points of a rounded rectangle (for ``create_polygon(..., smooth=True)``)."""
    return [x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r, x2, y2 - r, x2, y2, x2 - r, y2,
            x1 + r, y2, x1, y2, x1, y2 - r, x1, y1 + r, x1, y1]


def rounded(c, x1, y1, x2, y2, r, **kw):
    return c.create_polygon(rr_points(x1, y1, x2, y2, r), smooth=True, **kw)


def hex_to_hsv(c):
    return colorsys.rgb_to_hsv(*(int(c[i:i + 2], 16) / 255 for i in (1, 3, 5)))


def hsv_to_hex(h, s, v):
    return "#" + "".join(f"{round(x * 255):02x}" for x in colorsys.hsv_to_rgb(h, s, v))

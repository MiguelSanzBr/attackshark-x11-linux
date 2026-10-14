"""Colours, fonts and timings of the interface.

Values that other modules read at call time (``FAMILY``, ``AUTOSAVE_MS``, ``POLL_MS``, ``FRAME_MS``, ``RETRY_MS``) are
always accessed as ``theme.NAME`` so they can be changed in one place (and patched in tests).
"""
import tkinter.font as tkfont

# palette
BG, TILE, TILE_HI, LINE, FG, MUTED, ACCENT, DANGER, WARN = (
    "#1b1b1b", "#262626", "#313131", "#3c3c3c", "#ececec", "#8c8c8c", "#4cd964", "#ff6b6b", "#ffcc66")
BODY_FILL, SEL_FILL = "#222222", "#1d3524"
CALLOUT_FILL, CALLOUT_LINE, CALLOUT_DOT = "#1d1733", "#7c5cd6", "#b9a1ec"

# timings (ms) and the ripple duration (s)
AUTOSAVE_MS, POLL_MS, FRAME_MS = 400, 2500, 33
RETRY_MS = 3000                  # next read attempt while the mouse does not answer
LISTEN_S, OFFLINE_S = 1.2, 12    # each poll listens this long; no event for this long = mouse asleep/off
PULSE = 0.35

FAMILY = "Sans"          # replaced at startup by pick_family()
PREFERRED_FAMILIES = ("Inter", "Cantarell", "Noto Sans", "DejaVu Sans")


def pick_family(root):
    """Nicest installed UI font (fallback: Tk's generic "Sans")."""
    return next((f for f in PREFERRED_FAMILIES if f in tkfont.families(root)), "Sans")


def font(size, weight="normal"):
    return (FAMILY, size, weight)
LINE_FG = "#e8e8e8"               # outline drawing strokes

"""Encode/decode the X11's settings reports.

Reports read from the mouse (DPI 0x04, lighting/power 0x05, polling 0x06) decode to a dict that keeps the raw
bytes; encoding starts from those bytes and changes only the documented fields, so anything not understood
goes back exactly as it came. The button map (0x08) cannot be read back from the mouse, so it is always built
from scratch (like the official app does). Macros (0x09) are not supported yet: three header bytes of the
macro report are not understood, and guessing them on real hardware is not worth the risk.
"""
from . import protocol as p

STAGES = 8
LIGHT_MODES = ["off", "static", "breathing", "neon", "color_breathing", "static_dpi", "breathing_dpi"]
BRIGHTNESS_MODES = ("static", "static_dpi")      # the app sends the brightness only for these, else 8


def _frame(raw, csum_at):
    """Copy of ``raw`` with the checksum of bytes 3..csum_at-1 written at ``csum_at``."""
    b = bytearray(raw)
    b[csum_at:csum_at + 2] = p.checksum(b[3:csum_at])
    return bytes(b)


def _check(raw, rid, csum_at=None):
    if len(raw) != p.SIZES[rid] or raw[0] != rid:
        raise ValueError(f"not a report {rid:#04x} ({len(raw)} bytes)")
    if csum_at is not None and raw[csum_at:csum_at + 2] != p.checksum(raw[3:csum_at]):
        raise ValueError(f"report {rid:#04x}: bad checksum")


# ------------------------------------------------------------------ 0x04 DPI stages, angle snap, ripple
DPI_CSUM = 50


def default_dpi():
    """The app's defaults (FUN_004a4670): 800/1600/2400/3200/5000/22000, stage 2 active, coloured stages."""
    raw = bytearray(p.SIZES[p.DPI])
    raw[0:3] = (p.DPI, p.SIZES[p.DPI], 1)
    raw[49] = 2
    doc = decode_dpi(_frame(raw, DPI_CSUM))
    doc["stages"] = [dict(dpi=d, on=i < 6, color=c) for i, (d, c) in enumerate(zip(
        (800, 1600, 2400, 3200, 5000, 22000, 800, 800),
        ("#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#ff00ff", "#ff4000", "#ffffff")))]
    doc["active"] = 2
    return doc


def decode_dpi(raw):
    _check(raw, p.DPI, DPI_CSUM)
    stages = []
    for i in range(STAGES):
        n = p.decode_step(raw[8 + i], raw[16 + i], raw[6] >> i & 1)
        r, g, b = raw[25 + 3 * i:28 + 3 * i]
        stages.append(dict(dpi=p.step_to_dpi(n), on=bool(raw[5] >> i & 1), color=f"#{r:02x}{g:02x}{b:02x}"))
    return dict(raw=bytes(raw), angle_snap=bool(raw[3]), ripple=bool(raw[4]), stages=stages,
                active=min(max(raw[24], 1), STAGES))


def encode_dpi(doc):
    if not any(s["on"] for s in doc["stages"]):
        raise ValueError("at least one DPI stage must be enabled")
    b = bytearray(doc["raw"])
    b[3], b[4] = int(doc["angle_snap"]), int(doc["ripple"])
    b[5] = b[6] = 0
    for i, s in enumerate(doc["stages"]):
        code, low, high = p.encode_step(p.dpi_to_step(s["dpi"]))
        b[5] |= int(s["on"]) << i
        b[6] |= high << i
        b[8 + i], b[16 + i] = code, low
        b[25 + 3 * i:28 + 3 * i] = bytes.fromhex(s["color"][1:7])
    b[7] = b[6]                                   # the app writes the high-range mask twice
    if not 1 <= doc["active"] <= STAGES:
        raise ValueError("active stage must be 1..8")
    b[24] = doc["active"]
    return _frame(b, DPI_CSUM)


# ------------------------------------------------------------------ 0x05 lighting, sleep timers, debounce
LIGHT_CSUM = 11


def default_light():
    raw = bytearray(p.SIZES[p.LIGHT])
    raw[0:3] = (p.LIGHT, p.SIZES[p.LIGHT], 1)
    doc = decode_light(_frame(raw, LIGHT_CSUM))
    doc.update(mode="off", color="#00ff00", brightness=8, speed=3, sleep=1, deep_sleep=10, debounce=4)
    return doc


def decode_light(raw):
    _check(raw, p.LIGHT, LIGHT_CSUM)
    mode = raw[3] >> 4
    return dict(raw=bytes(raw), mode=LIGHT_MODES[mode] if mode < len(LIGHT_MODES) else mode,
                speed=min(max(6 - (raw[4] & 0x0F), 1), 5),          # firmware 5..1 = app slider 4..8
                brightness=raw[5] & 0x0F, deep_sleep=(raw[4] & 0xF0) | raw[5] >> 4,
                color="#{:02x}{:02x}{:02x}".format(*raw[6:9]), sleep=raw[9], debounce=raw[10])


def encode_light(doc):
    for key, lo, hi in (("speed", 1, 5), ("brightness", 1, 8), ("sleep", 1, 60), ("deep_sleep", 1, 60),
                        ("debounce", 2, 25)):
        if not lo <= doc[key] <= hi:
            raise ValueError(f"{key} must be {lo}..{hi}")
    b = bytearray(doc["raw"])
    mode = doc["mode"] if isinstance(doc["mode"], int) else LIGHT_MODES.index(doc["mode"])
    b[3] = mode << 4 | (b[3] & 0x0F)
    deep = doc["deep_sleep"]
    b[4] = (deep & 0xF0) | (6 - doc["speed"])
    bright = doc["brightness"] if doc["mode"] in BRIGHTNESS_MODES else 8
    b[5] = (deep << 4 & 0xF0) | bright
    b[6:9] = bytes.fromhex(doc["color"][1:7])
    b[9], b[10] = doc["sleep"], doc["debounce"]
    return _frame(b, LIGHT_CSUM)


# ------------------------------------------------------------------ 0x06 polling rate
def decode_polling(raw):
    _check(raw, p.POLLING)
    rate = {v: k for k, v in p.POLLING_CODES.items()}.get(raw[3])
    return dict(raw=bytes(raw), rate=rate)


def encode_polling(rate):
    code = p.POLLING_CODES.get(rate)
    if code is None:
        raise ValueError(f"polling rate must be one of {sorted(p.POLLING_CODES)}")
    return bytes([p.POLLING, p.SIZES[p.POLLING], 1, code, code ^ 0xFF, 0, 0, 0, 0])


# ------------------------------------------------------------------ 0x08 buttons
# physical buttons -> slot (FUN_004a26c0 / ms_4_page.xml); slot 5 is the DPI button under the wheel
BUTTONS = {"left": 0, "right": 1, "middle": 2, "dpi": 5, "forward": 6, "back": 7}
SLOTS = 18
WHEEL_UP, WHEEL_DOWN = 16, 17
# action name -> 3 firmware bytes (table 0x4ec3b8)
ACTIONS = {
    "off": (0x01, 0, 0), "left": (0x02, 0, 0), "right": (0x03, 0, 0), "middle": (0x04, 0, 0),
    "back": (0x05, 0, 0), "forward": (0x06, 0, 0), "double_click": (0x07, 0, 0), "fire": (0x08, 0, 0),
    "scroll_up": (0x09, 0, 0), "scroll_down": (0x0A, 0, 0), "tilt_left": (0x0B, 0, 0), "tilt_right": (0x0C, 0, 0),
    "dpi_cycle": (0x0D, 0, 0), "dpi_up": (0x0E, 0, 0), "dpi_down": (0x0F, 0, 0), "easy_aim": (0x10, 0, 3),
    "media_player": (0x15, 0, 0), "prev_track": (0x16, 0, 0), "next_track": (0x17, 0, 0),
    "play_pause": (0x18, 0, 0), "stop": (0x19, 0, 0), "mute": (0x1A, 0, 0), "volume_up": (0x1B, 0, 0),
    "volume_down": (0x1C, 0, 0), "calculator": (0x1D, 0, 0), "email": (0x1E, 0, 0),
    "browser_forward": (0x20, 0, 0), "browser_back": (0x21, 0, 0), "browser_stop": (0x22, 0, 0),
    "my_computer": (0x23, 0, 0), "browser_refresh": (0x24, 0, 0), "browser_home": (0x25, 0, 0),
    "browser_search": (0x26, 0, 0),
}
KEY_ACTION = 0x11
MODS = {"ctrl": 1, "shift": 2, "alt": 4, "win": 8}
# default map (table 0x4ec8f0): left, right, middle, -, -, DPI cycle, forward, back, -.., wheel up/down
DEFAULT_MAP = ["left", "right", "middle", "off", "off", "dpi_cycle", "forward", "back"] + ["off"] * 8 + \
              ["scroll_up", "scroll_down"]


def action_bytes(action):
    """Firmware bytes of an action: a name from ACTIONS or ``("key", mods, hid_usage)``."""
    if isinstance(action, str):
        try:
            return ACTIONS[action]
        except KeyError:
            raise ValueError(f"unknown action {action!r}") from None
    kind = action[0]
    if kind == "key":
        mods, usage = action[1], action[2]
        if not (0 <= mods <= 15 and 0 < usage <= 0xFF):
            raise ValueError("key action needs mods 0..15 and a HID usage 1..255")
        return KEY_ACTION, mods, usage
    raise ValueError(f"unknown action {action!r}")


def encode_buttons(mapping):
    """``mapping``: 18 actions, one per slot. Refuses a map without a left click (the app's rule)."""
    if len(mapping) != SLOTS:
        raise ValueError(f"need {SLOTS} button slots")
    if "left" not in mapping:
        raise ValueError("at least one button must stay a left click")
    b = bytearray(p.SIZES[p.BUTTONS])
    b[0:3] = (p.BUTTONS, p.SIZES[p.BUTTONS], 1)
    for k, act in enumerate(mapping):
        b[3 + 3 * k:6 + 3 * k] = action_bytes(act)
    return _frame(b, 57)


# ------------------------------------------------------------------ keyboard shortcuts
# key name -> HID keyboard usage (for the ("key", mods, usage) action)
KEYS = {**{chr(ord("a") + i): 0x04 + i for i in range(26)}, **{str((i + 1) % 10): 0x1E + i for i in range(10)},
        "enter": 0x28, "esc": 0x29, "backspace": 0x2A, "tab": 0x2B, "space": 0x2C, "minus": 0x2D, "equal": 0x2E,
        **{f"f{i + 1}": 0x3A + i for i in range(12)}, "printscreen": 0x46, "insert": 0x49, "home": 0x4A,
        "pageup": 0x4B, "delete": 0x4C, "end": 0x4D, "pagedown": 0x4E, "right": 0x4F, "left": 0x50,
        "down": 0x51, "up": 0x52}


def parse_shortcut(text):
    """``"ctrl+shift+s"`` -> ``("key", mods, usage)``."""
    *mods, key = text.lower().split("+")
    if key not in KEYS or any(m not in MODS for m in mods):
        raise ValueError(f"unknown shortcut {text!r} (modifiers: {', '.join(MODS)}; keys: a-z, 0-9, f1-f12, ...)")
    return "key", sum(MODS[m] for m in set(mods)), KEYS[key]


def shortcut_text(action):
    mods = [m for m, bit in MODS.items() if action[1] & bit]
    key = next((k for k, v in KEYS.items() if v == action[2]), f"0x{action[2]:02x}")
    return "+".join(mods + [key])

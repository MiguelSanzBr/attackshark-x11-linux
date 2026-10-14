"""ATTACK SHARK X11 protocol: constants, checksum, report framing and the DPI encoding (pure functions).

All settings travel as HID *feature* reports on the vendor collection (usage page 0x0B) of interface 2,
of the 2.4G receiver (1d57:fa60) or of the mouse on its cable (1d57:fa55). Events arrive as *input* report
0x03 on the same hidraw node. ``docs/PROTOCOL.md`` describes every byte.
"""
VID = 0x1D57
PID_RECEIVER, PID_WIRED = 0xFA60, 0xFA55
PIDS = {PID_RECEIVER: "2.4G receiver", PID_WIRED: "USB cable"}

# model id = byte 1 of every input report 0x03 (the app's 18 model pages)
MODELS = {0x85: "X6", 0x4D: "X3", 0x10: "R1", 0x55: "X11", 0x4E: "X3MAX", 0xB1: "X1", 0xBE: "X11PRO",
          0x01: "X3PRO", 0x03: "V5SE", 0x07: "X11SE", 0x02: "X8SE", 0x06: "X8 Plus", 0x08: "X8 PRO",
          0x04: "G3", 0x0E: "G3 PRO", 0xE5: "V3 PRO", 0x24: "V6", 0xEA: "V3"}
MODEL_X11 = 0x55

# feature reports: id -> total size in bytes, report id included (from the receiver's report descriptor)
SIZES = {0x04: 56, 0x05: 15, 0x06: 9, 0x08: 59, 0x09: 64, 0x0B: 8, 0xA0: 8}
DPI, LIGHT, POLLING, BUTTONS, MACRO, IDENT, READ_REQ = 0x04, 0x05, 0x06, 0x08, 0x09, 0x0B, 0xA0
WRITABLE = (DPI, LIGHT, POLLING, BUTTONS)    # the only reports this tool ever writes (macros 0x09: not yet)

# input report 0x03 events: 03 <model> <event> <v0> <v1>
EV_DPI, EV_POLLING, EV_BATTERY, EV_ACK, EV_LIGHT = 0x10, 0x20, 0x40, 0x50, 0x70
CHARGING = 3                     # battery event v0 through the receiver; v1 = percent

POLLING_CODES = {1000: 0x01, 500: 0x02, 250: 0x04, 125: 0x08}


def checksum(data):
    """16-bit sum of ``data``, big-endian (the app's checksum for every multi-byte block)."""
    s = sum(data) & 0xFFFF
    return bytes([s >> 8, s & 0xFF])


def read_request(rid, flag=1):
    """Feature report 0xA0 that asks for settings report ``rid`` (the app uses flag 0 only for 0x0B)."""
    return bytes([READ_REQ, rid, SIZES[rid], 0, flag, 0, 0, 0])


def parse_event(report):
    """``(model, event, v0, v1)`` of an input report 0x03, else ``None``."""
    if len(report) < 5 or report[0] != 0x03:
        return None
    return report[1], report[2], report[3], report[4]


# ------------------------------------------------------------------ DPI encoding
# Sensor code table T[n] (n = 0..220) from AttackShark.exe @0x4ec024; T[n] ~ round(50 n / 42.55)
T = (0xFFFFFF,
    1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 21, 22, 23,
    24, 25, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37, 38, 39, 41, 42, 43, 44, 45, 47,
    48, 49, 50, 51, 52, 54, 55, 56, 57, 58, 59, 61, 62, 63, 64, 65, 67, 68, 69, 70,
    71, 72, 74, 75, 76, 77, 78, 79, 81, 82, 83, 84, 85, 87, 88, 89, 90, 91, 92, 94,
    95, 96, 97, 98, 99, 101, 102, 103, 104, 105, 107, 108, 109, 110, 111, 112, 114, 115, 116, 117,
    118, 119, 121, 122, 123, 124, 125, 127, 128, 129, 130, 131, 132, 134, 135, 136, 137, 138, 139, 141,
    142, 143, 144, 145, 147, 148, 149, 150, 151, 152, 154, 155, 156, 157, 158, 159, 161, 162, 163, 164,
    165, 167, 168, 169, 170, 171, 172, 174, 175, 176, 177, 178, 179, 181, 182, 183, 184, 185, 187, 188,
    189, 190, 191, 192, 194, 195, 196, 197, 198, 199, 201, 202, 203, 204, 205, 207, 208, 209, 210, 211,
    212, 214, 215, 216, 217, 218, 219, 221, 222, 223, 224, 225, 227, 228, 229, 230, 231, 232, 234, 235,
    118, 119, 121, 122, 123, 124, 125, 127, 128, 129, 130, 131, 132, 134, 135, 136, 137, 138, 139, 141,
     )
assert len(T) == 221


def dpi_to_step(dpi):
    """The app's slider step n (1..320) for a DPI value: 50 DPI steps to 10000, then 100 DPI steps to 22000."""
    if not 50 <= dpi <= 22000 or dpi % (50 if dpi <= 10000 else 100):
        raise ValueError(f"DPI must be 50..10000 in steps of 50 or 10100..22000 in steps of 100, not {dpi}")
    return dpi // 50 if dpi <= 10000 else dpi // 100 + 100


def step_to_dpi(n):
    return 50 * n if n <= 200 else 100 * (n - 100)


def encode_step(n):
    """``(code, low_flag, high_flag)`` for slider step ``n`` (FUN_004a2050): DPI ~ code * 42.55 * 2^(low + high)."""
    if n <= 200:
        return T[n], 0, 0
    if n <= 220:
        return T[n], 1, 0
    if n <= 300:
        return T[n - 100], 0, 1
    # the app uses T[200 + ((n - 300) >> 1)]: for n = 301 that is the 10000-DPI code times 4 (~40000 DPI) and the
    # rest lags up to 216 DPI behind; the code from the formula every other step follows hits 22000 the same way
    return round(step_to_dpi(n) / (42.55 * 4)), 1, 1


_DECODE = {}
for _n in range(1, 321):              # above 20000 DPI two steps can share a code: the higher one wins (22000)
    _DECODE[encode_step(_n)] = _n


def decode_step(code, low, high):
    """Slider step for an encoding read from the mouse, else the nearest step by the physical formula."""
    n = _DECODE.get((code, low, high))
    if n is not None:
        return n
    dpi = code * 42.55 * 2 ** (low + high)
    return min(range(1, 321), key=lambda k: abs(step_to_dpi(k) - dpi))

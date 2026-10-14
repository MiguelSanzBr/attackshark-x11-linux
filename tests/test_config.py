import pytest

from sharkx11 import config as c, protocol as p


def test_dpi_defaults_round_trip():
    raw = c.encode_dpi(c.default_dpi())
    assert raw[:3] == bytes([4, 56, 1]) and raw[49] == 2 and raw[50:52] == p.checksum(raw[3:50])
    doc = c.decode_dpi(raw)
    assert [s["dpi"] for s in doc["stages"][:6]] == [800, 1600, 2400, 3200, 5000, 22000]
    assert [s["on"] for s in doc["stages"]] == [True] * 6 + [False] * 2 and doc["active"] == 2
    assert doc["stages"][6]["color"] == "#ff4000" and raw[5] == 0x3F and raw[6] == raw[7] == 0x20
    assert c.encode_dpi(doc) == raw


def test_dpi_edit_keeps_unknown_bytes():
    doc = c.default_dpi()
    doc["raw"] = doc["raw"][:52] + b"\x09\x08\x07\x06"
    doc.update(angle_snap=True, ripple=True, active=1)
    doc["stages"][0].update(dpi=12100, color="#123456")
    raw = c.encode_dpi(doc)
    assert raw[3] == raw[4] == 1 and raw[24] == 1 and raw[52:] == b"\x09\x08\x07\x06"
    assert raw[6] & 1 and raw[25:28] == bytes([0x12, 0x34, 0x56])
    assert c.decode_dpi(raw)["stages"][0]["dpi"] == 12100


def test_dpi_rejects():
    doc = c.default_dpi()
    for s in doc["stages"]:
        s["on"] = False
    with pytest.raises(ValueError, match="at least one"):
        c.encode_dpi(doc)
    doc = c.default_dpi()
    doc["active"] = 9
    with pytest.raises(ValueError, match="active"):
        c.encode_dpi(doc)
    raw = bytearray(c.encode_dpi(c.default_dpi()))
    raw[50] ^= 1
    with pytest.raises(ValueError, match="checksum"):
        c.decode_dpi(bytes(raw))
    with pytest.raises(ValueError, match="not a report"):
        c.decode_dpi(raw[:20])


def test_light_round_trip_and_fields():
    doc = c.default_light()
    raw = c.encode_light(doc)
    assert raw == bytes([5, 15, 1, 0x00, 0x03, 0xA8, 0, 255, 0, 1, 4]) + p.checksum(raw[3:11]) + b"\0\0"
    doc = c.decode_light(raw)
    assert (doc["mode"], doc["speed"], doc["brightness"], doc["deep_sleep"], doc["sleep"], doc["debounce"]) == \
           ("off", 3, 8, 10, 1, 4)
    doc.update(mode="static", brightness=3, speed=5, deep_sleep=33, color="#ff8000")
    raw = c.encode_light(doc)
    back = c.decode_light(raw)
    assert (back["mode"], back["brightness"], back["speed"], back["deep_sleep"], back["color"]) == \
           ("static", 3, 5, 33, "#ff8000")
    doc["mode"] = "neon"                                  # brightness only goes out for the static modes
    assert c.decode_light(c.encode_light(doc))["brightness"] == 8
    doc["mode"] = 2
    assert c.decode_light(c.encode_light(doc))["mode"] == "breathing"


def test_light_unknown_mode_and_limits():
    raw = bytearray(c.encode_light(c.default_light()))
    raw[3] = 0x90
    raw[11:13] = p.checksum(raw[3:11])
    assert c.decode_light(bytes(raw))["mode"] == 9
    doc = c.default_light()
    doc["sleep"] = 61
    with pytest.raises(ValueError, match="sleep"):
        c.encode_light(doc)


def test_polling():
    raw = c.encode_polling(500)
    assert raw == bytes([6, 9, 1, 2, 0xFD, 0, 0, 0, 0]) and c.decode_polling(raw)["rate"] == 500
    assert c.decode_polling(bytes([6, 9, 1, 0x10, 0xEF, 0, 0, 0, 0]))["rate"] is None
    with pytest.raises(ValueError):
        c.encode_polling(300)


def test_buttons():
    raw = c.encode_buttons(c.DEFAULT_MAP)
    assert raw[:3] == bytes([8, 59, 1]) and raw[57:59] == p.checksum(raw[3:57])
    assert raw[3:6] == bytes([2, 0, 0]) and raw[3 + 3 * 5] == 0x0D and raw[3 + 3 * 16] == 0x09
    m = list(c.DEFAULT_MAP)
    m[6] = ("key", c.MODS["ctrl"] | c.MODS["shift"], 0x12)
    assert c.encode_buttons(m)[21:24] == bytes([0x11, 3, 0x12])
    for bad, msg in ((m[:3], "slots"), (["right"] * 18, "left click")):
        with pytest.raises(ValueError, match=msg):
            c.encode_buttons(bad)
    for act in ("nope", ("key", 16, 4), ("key", 0, 0), ("macro", 1)):
        with pytest.raises(ValueError):
            c.action_bytes(act)

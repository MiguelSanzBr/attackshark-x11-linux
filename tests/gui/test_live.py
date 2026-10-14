"""Live presses: report parsing, mapping functions to parts, the animation and the reader thread."""
import os
import socket
import time

from sharkx11 import config, discovery, protocol as p
from sharkx11.gui import live, theme

from .conftest import clear_timers


def test_parse_report():
    assert live.parse_report("mouse", bytes([0x21, 0, 0, 0, 0, 0, 0])) == [("buttons", 0x01)]
    assert live.parse_report("mouse", bytes([0, 0, 0, 0, 0, 0xFF, 0])) == [("buttons", 0), ("wheel", -1)]
    assert live.parse_report("mouse", bytes([0, 0, 0, 0, 0, 1, 0])) == [("buttons", 0), ("wheel", 1)]
    assert live.parse_report("mouse", bytes([4])) == [("buttons", 4)]
    assert live.parse_report("vendor", bytes([2, 0xE9, 0])) == [("consumer", 0xE9)]
    assert live.parse_report("vendor", bytes([3, 0x55, p.EV_DPI, 3, 0])) == [("dpi", 3)]
    assert live.parse_report("vendor", bytes([3, 0x55, p.EV_BATTERY, 1, 80])) == []
    assert live.parse_report("vendor", bytes([1, 0x81])) == []


def fills(app):
    return {k: app.canvas.itemcget(app.parts[k], "fill") for k in list(config.BUTTONS) + ["dpi"]}


def test_clicks_light_the_mapped_parts(app):
    app.buttons = list(config.DEFAULT_MAP)
    app.buttons[7] = "volume_up"                                   # back side button sends Volume +
    app.live("buttons", 0x01 | 0x10)                               # left + forward
    assert app.pressed == {"left", "forward"}
    app.animate()
    f = fills(app)
    assert f["left"] == f["forward"] == theme.ACCENT and f["right"] == theme.BG
    app.live("consumer", 0xE9)
    assert app.pressed == {"left", "forward", "back"}
    app.live("consumer", 0)
    app.live("buttons", 0)                                          # released: fades back
    assert not app.pressed
    for k in app.press_t:
        app.press_t[k] -= theme.PULSE / 2
    app.animate()
    assert fills(app)["left"] not in (theme.ACCENT, theme.SEL_FILL)   # mid-fade
    for k in app.press_t:
        app.press_t[k] -= theme.PULSE
    app.animate()
    f = fills(app)
    assert f["left"] == theme.SEL_FILL and f["forward"] == theme.BG   # selected part keeps its tint
    clear_timers(app)


def test_wheel_and_dpi_flash(app):
    app.live("wheel", -1)
    app.animate()
    assert fills(app)["middle"] != theme.BG
    app.live("dpi", 4)                                             # stage changed on the mouse
    assert app.dpi["active"] == 4 and app.v["active"].get() == 4 and not app.dirty
    app.live("dpi", 4)
    app.live("dpi", 9)                                             # out of range: ignored
    app.animate()
    assert fills(app)["dpi"] != theme.BG
    app.live("buttons", 0x04)                                      # middle click wins over the wheel flash
    app.animate()
    assert fills(app)["middle"] == theme.ACCENT
    clear_timers(app)


def test_live_before_a_read(mk):
    a = mk(read=False)
    a.live("dpi", 2)
    a.live("buttons", 1)
    assert not a.pressed


def test_reader_thread(app, monkeypatch):
    mouse_host, mouse_dev = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET)
    vend_host, vend_dev = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET)
    paths = {"/dev/m": mouse_host.fileno(), "/dev/v": vend_host.fileno()}
    real_open, real_close = os.open, os.close
    monkeypatch.setattr(discovery, "find_devices", lambda: iter([("/dev/v", p.PID_RECEIVER)]))
    monkeypatch.setattr(discovery, "find_mouse_node", lambda path: "/dev/m")
    monkeypatch.setattr(live.os, "open", lambda path, flags: paths[path] if path in paths else real_open(path, flags))
    monkeypatch.setattr(live.os, "close", lambda fd: None if fd in paths.values() else real_close(fd))
    got, sleeps = [], []
    monkeypatch.setattr(app, "after", lambda ms, fn, *args: got.append(args))
    mouse_dev.send(bytes([1, 0, 0, 0, 0, 0, 0]))
    vend_dev.send(bytes([2, 0xE9, 0]))

    def stop(s):
        sleeps.append(s)
        app._closing = True
    monkeypatch.setattr(live.time, "sleep", stop)
    real_select = live.select.select

    def select_once(r, w, x, t):
        ready = real_select(r, w, x, 0.05)[0]
        if not ready:
            raise OSError("unplugged")                             # drained: simulate the receiver going away
        return ready, [], []
    monkeypatch.setattr(live.select, "select", select_once)
    app._live_loop()
    assert ("buttons", 1) in got and ("consumer", 0xE9) in got and sleeps == [1]
    app._closing = False
    monkeypatch.setattr(discovery, "find_devices", lambda: iter([]))  # nothing plugged: waits and retries
    app._live_loop()
    app._closing = False
    monkeypatch.setattr(discovery, "find_devices", lambda: iter([("/dev/v", p.PID_RECEIVER)]))

    def close_now(r, w, x, t):                                     # window closed while listening
        app._closing = True
        return [], [], []
    monkeypatch.setattr(live.select, "select", close_now)
    app._live_loop()
    app._closing = False
    for s in (mouse_host, mouse_dev, vend_host, vend_dev):
        s.close()


def test_reader_stops_when_closing(app):
    app._closing = True
    app._live_loop()                                               # returns at once
    app._closing = False

"""Mixin: live presses. A reader thread watches the receiver's mouse reports (clicks, wheel) and its vendor
reports (media keys, DPI button) — read-only, alongside the system — and the drawing lights the button that
was pressed, with a short fade after release.

The mouse reports carry the *function* that was sent, not the physical button, so a part lights when the
function it is mapped to arrives (keyboard shortcuts are not followed: they come from another interface).
"""
import os
import select
import time

from .. import config, discovery, protocol as p
from . import theme
from .drawing import mix
from .theme import ACCENT, BG, SEL_FILL

BUTTON_BITS = {"left": 0x01, "right": 0x02, "middle": 0x04, "back": 0x08, "forward": 0x10}
# consumer-control usages (report 0x02 on the vendor interface) of the media actions
CONSUMER = {0xE9: "volume_up", 0xEA: "volume_down", 0xE2: "mute", 0xCD: "play_pause", 0xB5: "next_track",
            0xB6: "prev_track", 0xB7: "stop", 0x183: "media_player", 0x18A: "email", 0x192: "calculator",
            0x194: "my_computer", 0x221: "browser_search", 0x223: "browser_home", 0x224: "browser_back",
            0x225: "browser_forward", 0x226: "browser_stop", 0x227: "browser_refresh"}


def parse_report(kind, r):
    """``(what, value)`` from one report: ``("buttons", mask)``, ``("wheel", step)``, ``("consumer", usage)``,
    ``("dpi", stage)`` — a list, since one mouse report can carry both buttons and a wheel step."""
    if kind == "mouse":
        out = [("buttons", r[0] & 0x1F)]
        if len(r) > 5 and r[5]:
            out.append(("wheel", r[5] - 256 if r[5] > 127 else r[5]))
        return out
    if r[:1] == b"\x02" and len(r) >= 3:
        return [("consumer", r[1] | r[2] << 8)]
    ev = p.parse_event(r)
    return [("dpi", ev[2])] if ev and ev[1] == p.EV_DPI else []


class LiveInput:
    # ------------------------------------------------------------ reader thread
    def _live_loop(self):
        """Background thread: follow the mouse and vendor reports; reconnects every second."""
        while not self._closing:
            fds = {}
            try:
                settings = next(discovery.find_devices(), (None,))[0]
                mouse_node = settings and discovery.find_mouse_node(settings)
                for path, kind in ((mouse_node, "mouse"), (settings, "vendor")):
                    if path:
                        fds[os.open(path, os.O_RDONLY | os.O_NONBLOCK)] = kind
                while fds and not self._closing:
                    for fd in select.select(list(fds), [], [], 0.5)[0]:
                        for what, value in parse_report(fds[fd], os.read(fd, 64)):
                            self.after(0, self.live, what, value)
            except OSError:
                pass
            finally:
                for fd in fds:
                    os.close(fd)
            if not self._closing:
                time.sleep(1)

    # ------------------------------------------------------------ events -> parts
    def live(self, what, value):
        now = time.time()
        if what == "buttons":
            self.out_mask = value
        elif what == "consumer":
            self.out_usage = value
        elif what == "wheel":
            self.press_t["wheel"] = now
        elif self.dpi is not None and 1 <= value <= config.STAGES:        # DPI button cycled the stage
            self.press_t["dpi"] = now
            if value != self.dpi["active"]:
                self.dpi["active"] = value
                self.load()
        down = set()
        if self.buttons is not None:
            for part, slot in config.BUTTONS.items():
                act = self.buttons[slot]
                if BUTTON_BITS.get(act, 0) & self.out_mask or (self.out_usage and CONSUMER.get(self.out_usage) == act):
                    down.add(part)
        for part in down - self.pressed:
            self.press_t[part] = now
        self.pressed = down

    # ------------------------------------------------------------ animation
    def _fill(self, key, base, now):
        t = (now - self.press_t.get(key, 0)) / theme.PULSE
        return ACCENT if key in self.pressed else mix(ACCENT, base, t) if t < 1 else base

    def animate(self):
        """Per frame: pressed parts in the accent colour, a fade back after release, wheel and DPI flashes."""
        now = time.time()
        for part in config.BUTTONS:
            base = SEL_FILL if part == self.sel_part else BG
            fill = self._fill(part, base, now)
            if part == "middle" and fill == base:                  # a wheel step flashes the wheel too
                fill = self._fill("wheel", base, now)
            self.canvas.itemconfigure(self.parts[part], fill=fill)
        self.canvas.itemconfigure(self.parts["dpi"], fill=self._fill("dpi", BG, now))
        self.after(theme.FRAME_MS, self.animate)

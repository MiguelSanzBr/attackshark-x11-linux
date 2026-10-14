"""Shared fixtures and helpers of the GUI tests. They need a real X display and the in-process FakeMouse."""
import os
import re
import time
import tkinter as tk
from types import SimpleNamespace

import pytest

from sharkx11 import device
from sharkx11.gui import app as app_mod, i18n, sync, theme


def pump(app, cond=None, timeout=5.0):
    """Run the Tk event loop until cond() (default: worker finished and its after-callbacks ran)."""
    cond = cond or (lambda: not app.busy)
    end = time.time() + timeout
    while time.time() < end:
        app.update()
        if cond():
            app.update()
            return
        time.sleep(0.003)
    raise AssertionError("pump timeout")


def fire(app, widget, tag, seq="<Button-1>"):
    """Invoke the Python callback bound to a canvas item tag (hit-testing needs a mapped window)."""
    app.tk.eval(re.sub(r"%.", "0", widget.tag_bind(tag, seq)))
    app.update()


def click(app, w, seq="<Button-1>"):
    """Run the handler bound to `seq` (event_generate does not reach widgets of a withdrawn window)."""
    app.tk.eval(re.sub(r"%.", "0", w.bind(seq)))
    app.update()


def walk(w):
    yield w
    for c in w.winfo_children():
        yield from walk(c)


def texts(cv):
    return [cv.itemcget(i, "text") for i in cv.find_all() if cv.type(i) == "text"]


def xy(x, y):
    return SimpleNamespace(x=x, y=y)


def clear_timers(a):
    for i in a.tk.splitlist(a.tk.call("after", "info")):
        a.after_cancel(i)
    a._save_job = a._retry_job = None


def badge(app):
    """``(version text or None, red X shown, battery text or None)``."""
    c = app.badge
    x = [i for i in c.find_all() if c.type(i) == "line" and c.itemcget(i, "fill") == theme.DANGER]
    bat = c.find_withtag("battery")
    ver = app.version_label.cget("text")
    return (ver.split()[-1] if ver else None), bool(x), (c.itemcget(bat[0], "text") if bat else None)


@pytest.fixture(scope="session", autouse=True)
def settings_file(tmp_path_factory):
    """Never touch the real ~/.config: settings and the button map live in a temp dir."""
    with pytest.MonkeyPatch.context() as mp:
        d = tmp_path_factory.mktemp("cfg")
        mp.setattr(app_mod, "SETTINGS", str(d / "gui.json"))
        mp.setenv("XDG_CONFIG_HOME", str(d))
        mp.setenv("LANGUAGE", "pt_BR:pt")
        yield str(d / "gui.json")
    i18n.LANG = "pt"


@pytest.fixture(autouse=True)
def pt_lang(settings_file):
    i18n.LANG = "pt"
    if os.path.exists(settings_file):
        os.remove(settings_file)


@pytest.fixture(autouse=True)
def dlg(monkeypatch):
    d = SimpleNamespace(save="", open="", yes=True, errors=[], asked=[])
    monkeypatch.setattr(sync.filedialog, "asksaveasfilename", lambda **kw: d.save)
    monkeypatch.setattr(sync.filedialog, "askopenfilename", lambda **kw: d.open)
    monkeypatch.setattr(sync.messagebox, "showerror", lambda *a, **kw: d.errors.append(a))
    monkeypatch.setattr(sync.messagebox, "askyesno", lambda *a, **kw: d.asked.append(a) or d.yes)
    monkeypatch.setattr(theme, "POLL_MS", 10 ** 7)
    monkeypatch.setattr(theme, "RETRY_MS", 10 ** 7)
    monkeypatch.setattr(theme, "LISTEN_S", 0.05)
    return d


@pytest.fixture(scope="session")
def shared_app():
    """One App for the whole run; mk() resets it per test."""
    with pytest.MonkeyPatch.context() as mp:
        def boom(*a, **k):
            raise AssertionError("real device access")
        mp.setattr(device, "Device", boom)
        mp.setattr(theme, "POLL_MS", 10 ** 7)
        a = app_mod.App()
    a.withdraw()
    a.tk.willdispatch()             # worker threads call app.after without a running mainloop()
    clear_timers(a)
    pump(a)
    yield a
    a.destroy()


@pytest.fixture
def mk(shared_app, fake):
    a = shared_app

    def make(read=True):
        pump(a)
        clear_timers(a)
        a.dpi = a.light = a.buttons = a.battery = None
        a.dirty.clear()
        a.sel_part = "left"
        a.show("dpi")
        if read:
            a.read_device()
            pump(a)
        return a
    yield make
    pump(a)
    clear_timers(a)


@pytest.fixture
def app(mk):
    return mk()


@pytest.fixture
def scratch(shared_app):
    f = tk.Frame(shared_app, bg=theme.BG)
    yield f
    f.destroy()


@pytest.fixture
def fast(monkeypatch):
    monkeypatch.setattr(theme, "AUTOSAVE_MS", 5)

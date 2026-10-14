"""x11gui: reading, editing every tab, auto-save, live events, backups, language."""
import json
import tkinter as tk

import pytest

from sharkx11 import config, device, protocol as p, state
from sharkx11.gui import app as app_mod, i18n, mouse, theme

from .conftest import badge, clear_timers, fire, pump, texts


def saved(app, fake, report):
    """Run the pending auto-save and return what the mouse got for ``report``."""
    app.autosave()
    pump(app)
    return fake.buttons if report == p.BUTTONS else fake.reports[report]


# ---------------------------------------------------------------- read
def test_read_shows_everything(app, fake):
    assert app.title_label.cget("text") == "ATTACK SHARK X11"
    assert "receptor 2.4G" in app.status.cget("text") and "não testado" not in app.status.cget("text")
    assert [s["step"].get() for s in app.v["stages"][:2]] == [16, 32] and app.v["active"].get() == 2
    assert app.stage_value[5].cget("text") == "22000 DPI" and app.v["polling"].get() == 1000
    assert app.v["mode"].get() == "off" and app.v["deep_sleep"].get() == 10
    assert app.v["actions"]["forward"].get() == "forward" and not app.dirty
    assert badge(app) == ("0x12", False, None)
    assert app.canvas.itemcget(app.parts["led"], "fill") == "#00ff00"          # active stage colour
    assert "Avançar" in texts(app.canvas)


def test_read_other_model_and_battery(mk, fake):
    fake.model = 0x07
    fake.reports[p.IDENT] = bytes([p.IDENT, 8, 0x07, 0x01, 0, 0, 0, 0])
    fake.event(p.EV_BATTERY, 3, 9)
    a = mk()
    assert a.title_label.cget("text") == "ATTACK SHARK X11SE" and "não testado" in a.status.cget("text")
    assert badge(a) == ("0x01", False, "9% ⚡")
    fake.reports[p.POLLING] = bytes([6, 9, 1, 0x10, 0xEF, 0, 0, 0, 0])        # unknown code: shown as 1000
    a = mk()
    assert a.polling == 1000


def test_mouse_off_is_not_an_error_and_retries(mk, fake, dlg, monkeypatch):
    def off(self):
        raise OSError(5, "Input/output error")
    real = device.Device.identify
    monkeypatch.setattr(device.Device, "identify", off)
    a = mk()
    assert not dlg.errors and "desligado" in a.status.cget("text") and a._retry_job
    assert badge(a)[1]
    a.busy = True                                            # a retry while busy waits for the next turn
    job = a._retry_job
    a.read_device(True)
    assert a._retry_job and a._retry_job != job
    a.busy = False
    monkeypatch.setattr(device.Device, "identify", real)
    a.read_device(True)
    pump(a)
    assert a._retry_job is None and "salvas automaticamente" in a.status.cget("text")


def test_permission_opens_a_dialog(mk, dlg, monkeypatch):
    def denied(self, path=None):
        raise SystemExit("permission denied on /dev/hidraw0")
    monkeypatch.setattr(device.Device, "__init__", denied)
    a = mk()
    assert dlg.errors and a._retry_job is None and a.status.cget("fg") == theme.DANGER


def test_run_errors(app, dlg, monkeypatch):
    def job(dev):
        raise IOError()
    app.run("x", job, lambda r: pytest.fail("done"))
    pump(app)
    assert app.status.cget("text") == "OSError" and dlg.errors
    app.run("", job, lambda r: pytest.fail("done"), quiet=True)
    pump(app)
    assert badge(app)[1]
    app.busy = True
    app.run("x", job, lambda r: pytest.fail("done"))                 # busy: ignored
    app.busy = False


# ---------------------------------------------------------------- DPI tab
def test_dpi_edits_are_saved(app, fake, fast):
    app.v["stages"][0]["step"].set(p.dpi_to_step(1200))
    app.v["stages"][6]["on"].set(True)
    assert app.stage_value[0].cget("text") == "1200 DPI" and app.dirty == {p.DPI}
    app.pick_stage(3)                                         # makes stage 4 active and edits its colour
    app.on_stage_color("#123456")
    app.on_stage_color("#123456")                             # same colour: nothing more
    doc = config.decode_dpi(saved(app, fake, p.DPI))
    assert doc["stages"][0]["dpi"] == 1200 and doc["stages"][6]["on"] and doc["active"] == 4
    assert doc["stages"][3]["color"] == "#123456" and "Salvo" in app.status.cget("text")
    assert app.canvas.itemcget(app.parts["led"], "fill") == "#123456" and not app.dirty


def test_dpi_needs_one_stage(app, fake, fast):
    for st in app.v["stages"]:
        st["on"].set(False)
    app.autosave()
    assert "at least one" in app.status.cget("text") and app.status.cget("fg") == theme.DANGER


def test_edits_before_a_read_are_ignored(mk):
    a = mk(read=False)
    a.v["stages"][0]["on"].set(True)
    a.v["active"].set(3)
    a.v["polling"].set(250)
    a.v["sleep"].set(9)
    a.v["actions"]["back"].set("mute")
    a.on_stage_color("#000001")
    a.on_light_color("#000001")
    a.reset_buttons()
    a.refresh_stages()
    a.refresh_light()
    a.changed(p.DPI)
    a.backup()
    assert not a.dirty


# ---------------------------------------------------------------- performance, light, power
def test_performance_light_power(app, fake, fast):
    app.v["polling"].set(250)
    app.v["angle_snap"].set(True)
    app.v["ripple"].set(True)
    app.v["debounce"].set(12)
    app.v["mode"].set("static")
    assert app.bright_row.winfo_manager() == "pack"           # brightness only for the static modes
    app.v["brightness"].set(3)
    app.v["speed"].set(5)
    app.v["sleep"].set(7)
    app.v["deep_sleep"].set(40)
    app.on_light_color("#ff0000")
    app.on_light_color("#ff0000")
    assert app.dirty == {p.DPI, p.LIGHT, p.POLLING}
    app.autosave()
    pump(app)
    assert fake.reports[p.POLLING][3] == 4 and config.decode_dpi(fake.reports[p.DPI])["ripple"]
    lt = config.decode_light(fake.reports[p.LIGHT])
    assert (lt["mode"], lt["brightness"], lt["speed"], lt["sleep"], lt["deep_sleep"], lt["debounce"], lt["color"]) == \
           ("static", 3, 5, 7, 40, 12, "#ff0000")
    app.v["mode"].set("neon")
    assert app.bright_row.winfo_manager() == ""


def test_unknown_light_mode_shows_off(mk, fake):
    raw = bytearray(fake.reports[p.LIGHT])
    raw[3] = 0x90
    raw[11:13] = p.checksum(raw[3:11])
    fake.reports[p.LIGHT] = bytes(raw)
    assert mk().v["mode"].get() == "off"


# ---------------------------------------------------------------- buttons
def test_button_actions(app, fake, fast):
    app.v["actions"]["back"].set("volume_up")
    assert app.key_rows["back"].winfo_manager() == ""
    app.v["actions"]["forward"].set("key")                     # shortcut row appears; empty is invalid
    assert app.key_rows["forward"].winfo_manager() == "pack" and "Atalho inválido" in app.status.cget("text")
    app.v["shortcut"]["forward"].set("ctrl+shift+s")
    raw = saved(app, fake, p.BUTTONS)
    assert raw[3 + 3 * 7:6 + 3 * 7] == bytes([0x1B, 0, 0]) and raw[21:24] == bytes([0x11, 3, 0x16])
    assert "Atalho: ctrl+shift+s" in texts(app.canvas) and "Volume +" in texts(app.canvas)
    assert state.load_buttons()[6] == ("key", 3, 0x16)
    a = app
    a.read_device()                                            # the saved map is shown again after a read
    pump(a)
    assert a.v["actions"]["forward"].get() == "key" and a.v["shortcut"]["forward"].get() == "ctrl+shift+s"


def test_left_click_must_stay(app, fake, fast):
    app.v["actions"]["left"].set("right")
    assert "clique esquerdo" in app.status.cget("text") and not app.dirty
    app.reset_buttons()
    assert app.buttons == config.DEFAULT_MAP and app.dirty == {p.BUTTONS}
    assert saved(app, fake, p.BUTTONS) == config.encode_buttons(config.DEFAULT_MAP)


def test_clicking_the_drawing_selects_a_button(app):
    fire(app, app.canvas, "part:back")
    assert app.tab == "buttons" and app.sel_part == "back"
    assert app.canvas.itemcget(app.parts["back"], "outline") == theme.ACCENT
    assert app.button_rows["back"].cget("fg") == theme.ACCENT and app.button_rows["left"].cget("fg") == theme.FG
    fire(app, app.canvas, "co:middle")
    assert app.sel_part == "middle"
    app.show("dpi")
    assert app.tabs["dpi"].winfo_manager() == "pack" and app.tabs["buttons"].winfo_manager() == ""


# ---------------------------------------------------------------- auto-save
def test_autosave_is_debounced_and_waits(app, fake):
    app.v["polling"].set(500)
    job = app._save_job
    app.v["polling"].set(125)
    assert app._save_job != job and "pendentes" in app.status.cget("text")
    app.busy = True
    app.autosave()
    assert app._save_job                                       # rescheduled while the worker is busy
    app.busy = False
    clear_timers(app)
    app.autosave()
    pump(app)
    assert fake.reports[p.POLLING][3] == 8


def test_autosave_error_keeps_the_change(app, fake, dlg):
    fake.silent = True
    app.v["polling"].set(500)
    clear_timers(app)
    app.autosave()
    pump(app, timeout=10)
    assert dlg.errors and app.dirty == {p.POLLING}


# ---------------------------------------------------------------- live events
def test_poll_follows_the_mouse(app, fake):
    fake.event(p.EV_BATTERY, 1, 64)
    fake.event(p.EV_DPI, 5)
    app.poll()
    pump(app)
    assert badge(app)[2] == "64%" and app.v["active"].get() == 5 and app.dpi["active"] == 5
    assert not app.dirty                                       # a change made on the mouse is not written back
    fake.event(p.EV_DPI, 5)                                    # same stage: nothing to do
    fake.event(p.EV_DPI, 9)                                    # out of range: ignored
    app.poll()
    pump(app)
    assert app.dpi["active"] == 5
    app.last_seen -= theme.OFFLINE_S + 1                       # nothing heard for a while: asleep/off
    app.poll()
    pump(app)
    assert badge(app)[1]
    clear_timers(app)


def test_poll_waits_for_data_and_idle(mk):
    a = mk(read=False)
    a.poll()                                                   # nothing read yet: only reschedules
    assert not a.busy
    clear_timers(a)


# ---------------------------------------------------------------- backups
def test_backup_and_restore(app, fake, dlg, tmp_path, fast):
    dlg.save = str(tmp_path / "b.json")
    app.v["actions"]["back"].set("mute")
    app.backup()
    data = json.loads((tmp_path / "b.json").read_text())
    assert data["polling"] == 1000 and data["buttons"][7] == "mute" and "Backup salvo" in app.status.cget("text")
    data["polling"] = 250
    data["buttons"][6] = ["key", 4, 0x3D]
    (tmp_path / "b.json").write_text(json.dumps(data))
    clear_timers(app)
    dlg.open = str(tmp_path / "b.json")
    app.restore()
    pump(app)
    assert fake.reports[p.POLLING][3] == 4 and fake.buttons[21:24] == bytes([0x11, 4, 0x3D])
    assert app.v["polling"].get() == 250 and app.v["shortcut"]["forward"].get() == "alt+f4"


def test_restore_cancel_invalid_and_no(app, dlg, tmp_path):
    dlg.save = ""
    app.backup()                                               # cancelled dialog
    dlg.open = ""
    app.restore()
    bad = tmp_path / "bad.json"
    bad.write_text("{")
    dlg.open = str(bad)
    app.restore()
    assert dlg.errors and "Arquivo inválido" in dlg.errors[-1][1]
    good = tmp_path / "g.json"
    good.write_text(json.dumps(dict(dpi=config.encode_dpi(app.dpi).hex(), light=config.encode_light(app.light).hex(),
                                    polling=500, buttons=list(config.DEFAULT_MAP))))
    dlg.open, dlg.yes = str(good), False
    app.restore()
    assert dlg.asked and app.polling == 1000 and not app.dirty


# ---------------------------------------------------------------- language, startup, misc
def test_language_switch_restarts(app, settings_file, monkeypatch):
    destroyed = []
    monkeypatch.setattr(app, "destroy", lambda: destroyed.append(1))
    app.change_lang("pt")                                      # same language: nothing
    app.change_lang("en")
    app.update()
    assert destroyed == [1] and app.restart and app_mod.load_settings() == {"lang": "en"}
    app.restart = False


def test_main_restarts_until_closed(monkeypatch):
    runs = []

    class Fake:
        def __init__(self):
            self.restart = len(runs) == 0
            runs.append(self)

        def mainloop(self):
            pass
    monkeypatch.setattr(app_mod, "App", Fake)
    app_mod.main()
    assert len(runs) == 2


def test_real_startup_in_english(monkeypatch, fake, settings_file):
    app_mod.save_settings({"lang": "en"})
    monkeypatch.setattr(tk, "_default_root", None)
    monkeypatch.setattr(theme, "FAMILY", theme.FAMILY)
    a = app_mod.App()
    a.withdraw()
    a.tk.willdispatch()
    try:
        pump(a, lambda: a.dpi is not None and not a.busy)
        assert i18n.LANG == "en" and "2.4G receiver" in a.status.cget("text")
        assert a.tab_pills["perf"].text == "Performance"
    finally:
        a.destroy()


def test_settings_file_errors(monkeypatch, tmp_path):
    monkeypatch.setattr(app_mod, "SETTINGS", str(tmp_path / "f" / "gui.json"))
    (tmp_path / "f").write_text("not a dir")
    app_mod.save_settings({"lang": "en"})                      # cannot create the folder: ignored
    assert app_mod.load_settings() == {}


def test_i18n():
    assert i18n.system_lang({"LANG": "pt_BR.UTF-8"}) == "pt" and i18n.system_lang({"LC_ALL": "de_DE"}) == "en"
    assert i18n.system_lang({}) == "en"
    i18n.LANG = "en"
    assert i18n._("Botões") == "Buttons" and i18n._("nope") == "nope"
    i18n.LANG = "pt"
    missing = {t for t, _k in app_mod.TABS} | set(app_mod.BUTTON_NAMES.values()) | set(app_mod.ACTION_NAMES.values()) \
        | set(app_mod.MODE_NAMES.values()) | set(app_mod.LINKS.values())
    neutral = {"DPI", "DPI +", "DPI −", "E-mail", "Neon", "Volume +", "Volume −"}     # the same in English
    assert not missing - set(i18n.EN) - neutral


def test_badge_states(app):
    app.set_connected(("0x12", 0, False))                      # empty battery: outline only
    assert badge(app) == ("0x12", False, "0%")
    app.set_connected(("0x12", 10, False))
    fills = {app.badge.itemcget(i, "fill") for i in app.badge.find_all() if app.badge.type(i) == "rectangle"}
    assert theme.DANGER in fills
    app.set_connected(False)
    assert badge(app) == (None, False, None)


def test_mouse_geometry():
    assert set(mouse.PARTS) == set(config.BUTTONS) and {c[0] for c in mouse.CALLOUTS} == set(config.BUTTONS)
    assert all(0 <= x <= mouse.WIDTH and 0 <= y <= mouse.HEIGHT for x, y in mouse.BODY)

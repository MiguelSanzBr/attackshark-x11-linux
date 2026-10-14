"""The ``x11gui`` main window: the mouse drawing with callouts on the left, settings tabs on the right."""
import json
import os
import threading
import tkinter as tk
import tkinter.font as tkfont

from .. import config, protocol as p
from . import i18n, mouse, theme
from .drawing import rounded
from .i18n import LANGS, _
from .live import LiveInput
from .sync import DeviceSync
from .theme import ACCENT, BG, FG, LINE, LINE_FG, MUTED, TILE, TILE_HI
from .widgets import ColorPicker, Pill, Select, Slider, Toggle, field, panel

SETTINGS = os.path.join(os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config"), "sharkx11", "gui.json")
TABS = [("DPI", "dpi"), ("Desempenho", "perf"), ("Botões", "buttons"), ("Iluminação", "light"), ("Energia", "power")]
BUTTON_NAMES = {"left": "Botão esquerdo", "right": "Botão direito", "middle": "Botão do meio (roda)",
                "forward": "Lateral da frente (4)", "back": "Lateral de trás (5)"}
ACTION_NAMES = {
    "left": "Clique esquerdo", "right": "Clique direito", "middle": "Clique do meio", "forward": "Avançar",
    "back": "Voltar", "double_click": "Clique duplo", "fire": "Tiro rápido", "scroll_up": "Rolar para cima",
    "scroll_down": "Rolar para baixo", "tilt_left": "Inclinar à esquerda", "tilt_right": "Inclinar à direita",
    "dpi_cycle": "Alternar DPI", "dpi_up": "DPI +", "dpi_down": "DPI −", "easy_aim": "Mira fácil",
    "media_player": "Player de mídia", "play_pause": "Tocar/pausar", "stop": "Parar", "prev_track": "Faixa anterior",
    "next_track": "Próxima faixa", "volume_up": "Volume +", "volume_down": "Volume −", "mute": "Mudo",
    "browser_home": "Navegador: início", "browser_back": "Navegador: voltar", "browser_forward": "Navegador: avançar",
    "browser_refresh": "Navegador: recarregar", "browser_stop": "Navegador: parar", "browser_search": "Navegador: busca",
    "email": "E-mail", "calculator": "Calculadora", "my_computer": "Meu computador", "off": "Desativado",
    "key": "Atalho de teclado…"}
MODE_NAMES = {"off": "Desligado", "static": "Fixo", "breathing": "Respiração", "neon": "Neon",
              "color_breathing": "Respiração colorida", "static_dpi": "Cor do DPI", "breathing_dpi": "Respiração do DPI"}
POLLING = (125, 250, 500, 1000)
LINKS = {p.PID_RECEIVER: "receptor 2.4G", p.PID_WIRED: "cabo USB"}


def load_settings():
    try:
        with open(SETTINGS, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_settings(data):
    try:
        os.makedirs(os.path.dirname(SETTINGS), exist_ok=True)
        with open(SETTINGS, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except OSError:
        pass                       # only a convenience (the language)


def action_label(act):
    return _("Atalho: {}").format(config.shortcut_text(act)) if isinstance(act, tuple) else _(ACTION_NAMES[act])


class App(LiveInput, DeviceSync, tk.Tk):
    LINKS = LINKS
    def __init__(self):
        super().__init__()
        saved = load_settings().get("lang")
        i18n.LANG = saved if saved in LANGS else i18n.system_lang()
        self.restart = False
        self.title("ATTACK SHARK X11 — Linux")
        self.configure(bg=BG)
        theme.FAMILY = theme.pick_family(self)
        self.s = max(1.0, tkfont.Font(root=self, font=theme.font(10)).metrics("linespace") / 15)
        self.dpi = self.light = self.buttons = self.model = self.battery = None
        self.polling, self.version, self.link = 1000, "?", ""
        self.dirty, self.busy, self._loading = set(), False, False
        self._save_job = self._retry_job = None
        self.last_seen, self.sel_part, self.edit_stage, self.tab = 0.0, "left", 0, "dpi"
        self.pressed, self.press_t, self.out_mask, self.out_usage, self._closing = set(), {}, 0, 0, False
        self._vars()
        self._build()
        w, h = int(1180 * self.s), int(860 * self.s)
        self.geometry(f"{min(w, int(self.winfo_screenwidth() * .95))}x{min(h, int(self.winfo_screenheight() * .9))}")
        self.after(200, self.read_device)
        self.after(theme.POLL_MS, self.poll)
        self.after(theme.FRAME_MS, self.animate)
        threading.Thread(target=self._live_loop, daemon=True).start()

    def destroy(self):
        self._closing = True
        for job in self.tk.splitlist(self.tk.call("after", "info")):   # timers would outlive the window
            self.after_cancel(job)
        super().destroy()

    # ------------------------------------------------------------ variables
    def _vars(self):
        I, B, S = tk.IntVar, tk.BooleanVar, tk.StringVar
        self.v = dict(stages=[dict(on=B(), step=I(value=16)) for _i in range(config.STAGES)], active=I(value=1),
                      angle_snap=B(), ripple=B(), polling=I(value=1000), debounce=I(value=4), sleep=I(value=1),
                      deep_sleep=I(value=10), mode=S(value="off"), brightness=I(value=8), speed=I(value=3),
                      actions={b: S() for b in config.BUTTONS}, shortcut={b: S() for b in config.BUTTONS})
        v = self.v
        for i, st in enumerate(v["stages"]):
            st["on"].trace_add("write", lambda *_a, i=i: self._stage(i))
            st["step"].trace_add("write", lambda *_a, i=i: self._stage(i))
        v["active"].trace_add("write", lambda *_a: self._dpi_field("active", v["active"].get()))
        for key in ("angle_snap", "ripple"):
            v[key].trace_add("write", lambda *_a, k=key: self._dpi_field(k, v[k].get()))
        v["polling"].trace_add("write", lambda *_a: self._polling())
        for key in ("debounce", "sleep", "deep_sleep", "mode", "brightness", "speed"):
            v[key].trace_add("write", lambda *_a, k=key: self._light_field(k, v[k].get()))
        for b in config.BUTTONS:
            v["actions"][b].trace_add("write", lambda *_a, b=b: self._action(b))
            v["shortcut"][b].trace_add("write", lambda *_a, b=b: self._action(b))

    def _stage(self, i):
        if self._loading or self.dpi is None:
            return
        st, var = self.dpi["stages"][i], self.v["stages"][i]
        st["on"], st["dpi"] = var["on"].get(), p.step_to_dpi(var["step"].get())
        self.stage_value[i].configure(text=f"{st['dpi']} DPI")
        self.changed(p.DPI)

    def _dpi_field(self, key, value):
        if not self._loading and self.dpi is not None:
            self.dpi[key] = value
            if key == "active":
                self.refresh_stages()
            self.changed(p.DPI)

    def _polling(self):
        if not self._loading and self.dpi is not None:
            self.polling = self.v["polling"].get()
            self.changed(p.POLLING)

    def _light_field(self, key, value):
        if not self._loading and self.light is not None:
            self.light[key] = value
            self.refresh_light()
            self.changed(p.LIGHT)

    def _action(self, b):
        if self._loading or self.buttons is None:
            return
        name, text = self.v["actions"][b].get(), self.v["shortcut"][b].get().strip()
        if name == "key":
            self.key_rows[b].pack(anchor="w", pady=(int(4 * self.s), 0))
            try:
                act = config.parse_shortcut(text)
            except ValueError:
                self.set_status(_("Atalho inválido: use algo como ctrl+c, alt+f4 ou f5."), True)
                return
        else:
            self.key_rows[b].pack_forget()
            act = name
        self.buttons[config.BUTTONS[b]] = act
        if "left" not in self.buttons:
            self.set_status(_("Pelo menos um botão precisa continuar como clique esquerdo."), True)
            return
        self.refresh_callouts()
        self.changed(p.BUTTONS)

    # ------------------------------------------------------------ layout
    def _build(self):
        s = self.s
        head = tk.Frame(self, bg=BG)
        head.pack(fill="x", padx=int(24 * s), pady=(int(16 * s), 0))
        self.title_label = tk.Label(head, text="ATTACK SHARK X11", bg=BG, fg=FG, font=theme.font(15, "bold"))
        self.title_label.pack(side="left")
        self.badge = tk.Canvas(head, height=int(22 * s), bg=BG, highlightthickness=0)
        self.badge.pack(side="right")

        foot = tk.Frame(self, bg=BG)
        foot.pack(side="bottom", fill="x", padx=int(24 * s), pady=int(14 * s))
        self.version_label = tk.Label(foot, text="", bg=BG, fg=MUTED, font=theme.font(8))
        self.version_label.pack(side="right", padx=(int(8 * s), 0))
        for text, cmd in ((_("Recarregar"), self.read_device), (_("Restaurar backup"), self.restore),
                          (_("Backup"), self.backup)):
            self.button(foot, text, cmd).pack(side="right", padx=int(4 * s))
        self.lang_pick = tk.StringVar(value=i18n.LANG)
        Select(foot, self.lang_pick, list(LANGS.items()), s).pack(side="right", padx=int(4 * s))
        self.lang_pick.trace_add("write", lambda *_a: self.change_lang(self.lang_pick.get()))
        self.status = tk.Label(foot, text="", bg=BG, fg=MUTED, anchor="w", font=theme.font(9))
        self.status.pack(side="left", fill="x", expand=True)
        self.set_connected(False)

        body = tk.Frame(self, bg=BG)
        body.pack(fill="both", expand=True, padx=int(24 * s), pady=int(10 * s))
        self.canvas = tk.Canvas(body, width=int((mouse.WIDTH + 2 * self.CALLOUT_W) * s),
                                height=int((mouse.HEIGHT + 20) * s), bg=BG, highlightthickness=0)
        self.canvas.pack(side="left", anchor="n")
        self.draw_mouse()
        right = tk.Frame(body, bg=BG)
        right.pack(side="left", fill="both", expand=True, padx=(int(16 * s), 0))
        bar = tk.Frame(right, bg=BG)
        bar.pack(anchor="w", pady=(0, int(10 * s)))
        self.tab_pills, self.tabs = {}, {}
        for title, key in TABS:
            self.tab_pills[key] = Pill(bar, _(title), s, cmd=lambda k=key: self.show(k), fill=TILE_HI, padx=14, pady=6)
            self.tab_pills[key].pack(side="left", padx=(0, int(6 * s)))
        for _title, key in TABS:
            frame = tk.Frame(right, bg=BG)
            getattr(self, "_tab_" + key)(frame)
            self.tabs[key] = frame
        self.show("dpi")

    CALLOUT_W = 150

    def button(self, parent, text, cmd):
        return Pill(parent, text, self.s, cmd=cmd, fill=TILE_HI, padx=14, pady=6)

    def card(self, parent, title):
        c, inner = panel(parent, self.s)
        c.pack(fill="x", pady=(0, int(10 * self.s)))
        tk.Label(inner, text=title, bg=TILE, fg=FG, font=theme.font(11, "bold")).pack(anchor="w", pady=(0, int(6 * self.s)))
        return inner

    def labeled(self, parent, text, var, lo, hi, unit=""):
        """Row: label, slider, value."""
        row = tk.Frame(parent, bg=TILE)
        row.pack(fill="x", pady=int(3 * self.s))
        tk.Label(row, text=text, bg=TILE, fg=FG, font=theme.font(10), width=22, anchor="w").pack(side="left")
        val = tk.Label(row, bg=TILE, fg=MUTED, font=theme.font(10), width=8, anchor="e")
        val.pack(side="right")
        Slider(row, var, lo, hi, self.s).pack(side="left", fill="x", expand=True, padx=int(8 * self.s))
        show = lambda *_a: val.configure(text=f"{var.get()} {unit}".strip())
        var.trace_add("write", show)
        show()
        return row

    def chips(self, parent, var, options):
        row = tk.Frame(parent, bg=TILE)
        row.pack(anchor="w")
        cells = []
        for value, text in options:
            cell = Pill(row, text, self.s, cmd=lambda v=value: var.set(v), padx=12, pady=5)
            cell.pack(side="left", padx=(0, int(6 * self.s)), pady=int(2 * self.s))
            cells.append((value, cell))

        def paint(*_a):
            for value, cell in cells:
                on = value == var.get()
                cell.set(fill=ACCENT if on else TILE_HI, fg=BG if on else FG)
        var.trace_add("write", paint)
        paint()

    def toggle_row(self, parent, text, var):
        row = tk.Frame(parent, bg=TILE)
        row.pack(fill="x", pady=int(3 * self.s))
        tk.Label(row, text=text, bg=TILE, fg=FG, font=theme.font(10)).pack(side="left")
        Toggle(row, var, self.s).pack(side="right")

    # ------------------------------------------------------------ tabs
    def _tab_dpi(self, f):
        c = self.card(f, _("Estágios de DPI"))
        tk.Label(c, text=_("Clique no número para ativar o estágio e editar a cor dele. O botão de DPI do mouse "
                           "alterna entre os estágios ligados."), bg=TILE, fg=MUTED, font=theme.font(9),
                 wraplength=int(620 * self.s), justify="left").pack(anchor="w", pady=(0, int(6 * self.s)))
        cols = tk.Frame(c, bg=TILE)
        cols.pack(fill="x")
        rows = tk.Frame(cols, bg=TILE)
        rows.pack(side="left", fill="x", expand=True)
        self.stage_pills, self.stage_value = [], []
        for i, st in enumerate(self.v["stages"]):
            row = tk.Frame(rows, bg=TILE)
            row.pack(fill="x", pady=int(2 * self.s))
            Toggle(row, st["on"], self.s).pack(side="left")
            pill = Pill(row, f"{i + 1}", self.s, cmd=lambda i=i: self.pick_stage(i), padx=10, pady=4, dot=True)
            pill.pack(side="left", padx=int(8 * self.s))
            val = tk.Label(row, bg=TILE, fg=FG, font=theme.font(10), width=10, anchor="e")
            val.pack(side="right")
            Slider(row, st["step"], 1, 320, self.s).pack(side="left", fill="x", expand=True)
            self.stage_pills.append(pill)
            self.stage_value.append(val)
        self.stage_picker = ColorPicker(c, self.s, self.on_stage_color)
        self.stage_picker.pack(anchor="w", pady=(int(8 * self.s), 0))

    def _tab_perf(self, f):
        c = self.card(f, _("Taxa de polling"))
        self.chips(c, self.v["polling"], [(r, f"{r} Hz") for r in POLLING])
        c = self.card(f, _("Sensor e cliques"))
        self.toggle_row(c, _("Angle snap (corrige linhas tortas)"), self.v["angle_snap"])
        self.toggle_row(c, _("Ripple control (suaviza tremidas)"), self.v["ripple"])
        self.labeled(c, _("Tempo de resposta dos botões"), self.v["debounce"], 2, 25, "ms")

    def _tab_buttons(self, f):
        c = self.card(f, _("Função dos botões"))
        tk.Label(c, text=_("O mouse não informa o mapa de botões de volta: o app guarda o último que gravou."),
                 bg=TILE, fg=MUTED, font=theme.font(9)).pack(anchor="w", pady=(0, int(6 * self.s)))
        self.button_rows, self.key_rows = {}, {}
        options = [(k, _(v)) for k, v in ACTION_NAMES.items()]
        for b in config.BUTTONS:
            row = tk.Frame(c, bg=TILE)
            row.pack(fill="x", pady=int(4 * self.s))
            line = tk.Frame(row, bg=TILE)
            line.pack(fill="x")
            title = tk.Label(line, text=_(BUTTON_NAMES[b]), bg=TILE, fg=FG, font=theme.font(10), width=24, anchor="w")
            title.pack(side="left")
            Select(line, self.v["actions"][b], options, self.s, fill=TILE_HI).pack(side="left")
            keyrow = tk.Frame(row, bg=TILE)
            tk.Label(keyrow, text=_("Atalho (ex.: ctrl+c, alt+f4, f5):"), bg=TILE, fg=MUTED,
                     font=theme.font(9)).pack(side="left", padx=(int(24 * self.s), int(6 * self.s)))
            field(keyrow, self.v["shortcut"][b], 16, theme.font(10), self.s).master.pack(side="left")
            self.button_rows[b], self.key_rows[b] = title, keyrow
        self.button(c, _("Restaurar botões de fábrica"), self.reset_buttons).pack(anchor="w", pady=(int(8 * self.s), 0))

    def _tab_light(self, f):
        c = self.card(f, _("Efeito"))
        self.chips(c, self.v["mode"], [(m, _(n)) for m, n in MODE_NAMES.items()][:4])
        self.chips(c, self.v["mode"], [(m, _(n)) for m, n in MODE_NAMES.items()][4:])
        self.bright_row = self.labeled(c, _("Brilho"), self.v["brightness"], 1, 8)
        self.labeled(c, _("Velocidade"), self.v["speed"], 1, 5)
        c = self.card(f, _("Cor"))
        self.light_picker = ColorPicker(c, self.s, self.on_light_color)
        self.light_picker.pack(anchor="w")

    def _tab_power(self, f):
        c = self.card(f, _("Economia de energia"))
        self.labeled(c, _("Dormir após"), self.v["sleep"], 1, 60, "min")
        self.labeled(c, _("Sono profundo após"), self.v["deep_sleep"], 1, 60, "min")
        tk.Label(c, text=_("A bateria aparece no topo enquanto o mouse está ligado ao receptor."), bg=TILE, fg=MUTED,
                 font=theme.font(9)).pack(anchor="w", pady=(int(6 * self.s), 0))

    def show(self, key):
        self.tab = key
        for k, frame in self.tabs.items():
            (frame.pack if k == key else frame.pack_forget)(**({"fill": "both", "expand": True} if k == key else {}))
            self.tab_pills[k].set(fill=ACCENT if k == key else TILE_HI, fg=BG if k == key else FG)

    # ------------------------------------------------------------ mouse drawing
    def draw_mouse(self):
        c, s = self.canvas, self.s
        c.delete("all")
        ox = self.CALLOUT_W
        self.parts = mouse.draw(c, s, ox, LINE_FG, "#6b6b6b", BG, self.pick_part)
        self.callout_items = {}
        for part, side, y in mouse.CALLOUTS:
            tx, ty = mouse.PARTS[part][1]
            x1 = 4 if side == "l" else ox + mouse.WIDTH + 14
            x2 = x1 + self.CALLOUT_W - 18
            edge = x2 if side == "l" else x1
            tag = f"co:{part}"
            rounded(c, x1 * s, (y - 11) * s, x2 * s, (y + 22) * s, 9 * s, fill=theme.CALLOUT_FILL,
                    outline=theme.CALLOUT_LINE, width=max(1, round(1.5 * s)), tags=tag)
            c.create_text((x1 + 10) * s, (y - 2) * s, text=_(BUTTON_NAMES[part]).split(" (")[0], anchor="w",
                          fill=MUTED, font=theme.font(8), tags=tag)
            self.callout_items[part] = c.create_text((x1 + 10) * s, (y + 11) * s, text="", anchor="w", fill=FG,
                                                     font=theme.font(9, "bold"), tags=tag)
            c.create_line(edge * s, y * s, (tx + ox) * s, ty * s, fill=theme.CALLOUT_LINE, width=max(1, round(1.5 * s)))
            c.create_oval((tx + ox - 3) * s, (ty - 3) * s, (tx + ox + 3) * s, (ty + 3) * s, fill=theme.CALLOUT_DOT, outline="")
            c.tag_bind(tag, "<Button-1>", lambda e, n=part: self.pick_part(n))
        self.refresh_parts()

    def pick_part(self, part):
        self.sel_part = part
        self.refresh_parts()
        self.show("buttons")

    def refresh_parts(self):
        for name in config.BUTTONS:
            on = name == self.sel_part
            self.canvas.itemconfigure(self.parts[name], outline=ACCENT if on else LINE_FG,
                                      fill=theme.SEL_FILL if on else BG)
            if hasattr(self, "button_rows"):
                self.button_rows[name].configure(fg=ACCENT if on else FG)

    def refresh_callouts(self):
        for part in config.BUTTONS:
            act = self.buttons[config.BUTTONS[part]] if self.buttons else None
            self.canvas.itemconfigure(self.callout_items[part], text=action_label(act) if act else "—")

    # ------------------------------------------------------------ load / refresh
    def load(self):
        """Show the decoded reports in the widgets without triggering auto-save."""
        self._loading = True
        try:
            v, d, lt = self.v, self.dpi, self.light
            for st, var in zip(d["stages"], v["stages"]):
                var["on"].set(st["on"])
                var["step"].set(p.dpi_to_step(st["dpi"]))
            v["active"].set(d["active"])
            v["angle_snap"].set(d["angle_snap"])
            v["ripple"].set(d["ripple"])
            v["polling"].set(self.polling)
            for key in ("debounce", "sleep", "deep_sleep", "brightness", "speed"):
                v[key].set(lt[key])
            v["mode"].set(lt["mode"] if lt["mode"] in MODE_NAMES else "off")
            for b, slot in config.BUTTONS.items():
                act = self.buttons[slot]
                v["actions"][b].set("key" if isinstance(act, tuple) else act)
                v["shortcut"][b].set(config.shortcut_text(act) if isinstance(act, tuple) else "")
                (self.key_rows[b].pack if isinstance(act, tuple) else self.key_rows[b].pack_forget)()
            for i, st in enumerate(d["stages"]):
                self.stage_value[i].configure(text=f"{st['dpi']} DPI")
            self.edit_stage = d["active"] - 1
        finally:
            self._loading = False
        self.refresh_stages()
        self.refresh_light()
        self.refresh_callouts()

    def refresh_stages(self):
        if self.dpi is None:
            return
        active = self.dpi["active"] - 1
        for i, (pill, st) in enumerate(zip(self.stage_pills, self.dpi["stages"])):
            pill.itemconfigure("dot", fill=st["color"])
            on = i == active
            pill.set(fill=ACCENT if on else TILE_HI, fg=BG if on else FG)
        self.stage_picker.set(self.dpi["stages"][self.edit_stage]["color"])
        self.canvas.itemconfigure(self.parts["led"], fill=self.dpi["stages"][active]["color"])

    def refresh_light(self):
        if self.light is None:
            return
        self.light_picker.set(self.light["color"])
        show = self.light["mode"] in config.BRIGHTNESS_MODES
        (self.bright_row.pack if show else self.bright_row.pack_forget)(**({"fill": "x"} if show else {}))

    def pick_stage(self, i):
        self.edit_stage = i
        self.v["active"].set(i + 1)

    def on_stage_color(self, color):
        if self.dpi is not None and self.dpi["stages"][self.edit_stage]["color"] != color:
            self.dpi["stages"][self.edit_stage]["color"] = color
            self.refresh_stages()
            self.changed(p.DPI)

    def on_light_color(self, color):
        if self.light is not None and self.light["color"] != color:
            self.light["color"] = color
            self.changed(p.LIGHT)

    def reset_buttons(self):
        if self.buttons is not None:
            self.buttons = list(config.DEFAULT_MAP)
            self.load()
            self.changed(p.BUTTONS)

    def change_lang(self, code):
        if code != i18n.LANG:
            save_settings({**load_settings(), "lang": code})
            self.restart = True
            self.after_idle(self.destroy)


def main():
    while True:
        app = App()
        app.mainloop()
        if not getattr(app, "restart", False):
            break

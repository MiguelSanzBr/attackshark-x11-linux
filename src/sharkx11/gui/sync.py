"""Mixin: device I/O on a worker thread — initial read, auto-save of the changed reports, live events, backups."""
import json
import threading
import time
from tkinter import filedialog, messagebox

from .. import config, device, protocol as p, state
from . import theme
from .i18n import _
from .theme import ACCENT, DANGER, MUTED


class DeviceSync:
    # ------------------------------------------------------------ status line / connection badge
    def set_status(self, text, error=False):
        self.status.configure(text=text, fg=DANGER if error else MUTED)

    def set_connected(self, state_):
        """Badge: ``(version, battery %, charging)`` connected (battery may be ``None``), ``None`` not answering
        (grey Wi-Fi with a red X), ``False`` still looking (grey Wi-Fi)."""
        c, s = self.badge, self.s
        c.delete("all")
        col, w = ACCENT if state_ else MUTED, max(1, round(2 * s))
        x, y = 11 * s, 17 * s
        for r in (5, 9.5, 14):
            c.create_arc(x - r * s, y - r * s, x + r * s, y + r * s, start=50, extent=80, style="arc", outline=col, width=w)
        c.create_oval(x - 2 * s, y - 2 * s, x + 2 * s, y + 2 * s, fill=col, outline="")
        if state_ is None:
            c.create_line(15 * s, 10 * s, 22 * s, 17 * s, fill=DANGER, width=w, capstyle="round")
            c.create_line(15 * s, 17 * s, 22 * s, 10 * s, fill=DANGER, width=w, capstyle="round")
        self.version_label.configure(text=_("versão {}").format(state_[0]) if state_ else "")
        if state_ and state_[1] is not None:
            battery, px, bw, bh, top = state_[1], 32 * s, 22 * s, 11 * s, 6 * s
            c.create_rectangle(px, top, px + bw, top + bh, outline=col, width=max(1, round(1.5 * s)))
            c.create_rectangle(px + bw, top + 3 * s, px + bw + 2.5 * s, top + bh - 3 * s, fill=col, outline="")
            level = min(max(battery, 0), 100) / 100
            if level:
                c.create_rectangle(px + 2 * s, top + 2 * s, px + 2 * s + (bw - 4 * s) * level, top + bh - 2 * s,
                                   fill=DANGER if battery <= 15 and not state_[2] else col, outline="")
            text = f"{battery}%" + (" ⚡" if state_[2] else "")
            c.create_text(px + bw + 6 * s, 11.5 * s, text=text, anchor="w", fill=col, font=theme.font(9), tags="battery")
        c.configure(width=c.bbox("all")[2] + 2)

    # ------------------------------------------------------------ worker
    def run(self, label, job, done, quiet=False, fail=None):
        """Run ``job(dev)`` on a worker thread; ``done(result)`` runs on the Tk thread. ``quiet``: no status text
        and no error dialog; ``fail(error, message)`` handles errors instead when given."""
        if self.busy:
            return
        self.busy = True
        if not quiet:
            self.set_status(label)

        def work():
            dev = None
            try:
                dev = device.Device()
                res = job(dev)
                self.after(0, lambda: done(res))
            except BaseException as e:        # Device uses sys.exit for user-facing errors
                msg = str(e) or e.__class__.__name__
                if fail:
                    self.after(0, lambda e=e: fail(e, msg))       # `e` is unbound once the except block ends
                elif quiet:
                    self.after(0, lambda: self.set_connected(None))
                else:
                    self.after(0, lambda: (self.set_status(msg, True), messagebox.showerror(_("Erro"), msg, parent=self)))
            finally:
                if dev:
                    dev.close()
                self.after(0, self._idle)
        threading.Thread(target=work, daemon=True).start()

    def _idle(self):
        self.busy = False

    # ------------------------------------------------------------ read
    def read_device(self, retry=False):
        """Read everything from the mouse. A mouse that does not answer (off, asleep, out of range) is not an
        error: the status says so and the read is retried until it answers; only no permission opens a dialog."""
        if self._retry_job:
            self.after_cancel(self._retry_job)
            self._retry_job = None
        if retry and self.busy:
            self._retry_job = self.after(theme.RETRY_MS, lambda: self.read_device(True))
            return

        def job(dev):
            model, version = dev.identify()
            return (model, version, dev.read(p.DPI), dev.read(p.LIGHT), dev.read(p.POLLING), dev.battery, dev.pid)

        def done(r):
            model, version, dpi, light, polling, battery, link = r
            self.model, self.link = model, _(self.LINKS[link])
            self.version = f"{version:#04x}"
            self.battery = battery
            self.dpi, self.light = config.decode_dpi(dpi), config.decode_light(light)
            self.polling = config.decode_polling(polling)["rate"] or 1000
            self.buttons = state.load_buttons()
            self.dirty.clear()
            self.load()
            self.set_connected(self.conn())
            name = p.MODELS.get(model, f"{model:#04x}")
            self.title_label.configure(text=f"ATTACK SHARK {name}")
            note = "" if model == p.MODEL_X11 else "  " + _("(modelo não testado: só o X11 foi verificado)")
            self.set_status(_("Configuração lida do mouse ({}). As mudanças são salvas automaticamente.").format(self.link)
                            + note)

        def fail(e, msg):
            self.set_connected(None)
            if isinstance(e, SystemExit) and "permission" in msg:
                self.set_status(msg, True)
                messagebox.showerror(_("Erro"), msg, parent=self)
                return
            self.set_status(_("Mouse desligado, dormindo ou fora de alcance. Mexa nele: ele será lido automaticamente."))
            self._retry_job = self.after(theme.RETRY_MS, lambda: self.read_device(True))
        self.run("" if retry else _("Lendo do mouse…"), job, done, quiet=retry, fail=fail)

    def conn(self):
        return (self.version, self.battery[1], self.battery[0]) if self.battery else (self.version, None, False)

    # ------------------------------------------------------------ auto-save
    def changed(self, report):
        """A setting changed: remember which report and save shortly (debounced)."""
        if self._loading or self.dpi is None:
            return
        self.dirty.add(report)
        if self._save_job:
            self.after_cancel(self._save_job)
        self._save_job = self.after(theme.AUTOSAVE_MS, self.autosave)
        self.set_status(_("Alterações pendentes…"))

    def autosave(self):
        self._save_job = None
        if self.busy:
            self._save_job = self.after(300, self.autosave)
            return
        try:
            packets = [self.encode(r) for r in sorted(self.dirty)]
        except ValueError as e:
            self.set_status(str(e), True)
            return
        sent, buttons = set(self.dirty), list(self.buttons)

        def job(dev):
            for data in packets:
                dev.write(data)

        def done(_r):
            self.dirty -= sent
            if p.BUTTONS in sent:
                state.save_buttons(buttons)
            self.set_status(_("✓ Salvo no mouse."))
        self.run(_("Salvando no mouse…"), job, done)

    def encode(self, report):
        return {p.DPI: lambda: config.encode_dpi(self.dpi), p.LIGHT: lambda: config.encode_light(self.light),
                p.POLLING: lambda: config.encode_polling(self.polling),
                p.BUTTONS: lambda: config.encode_buttons(self.buttons)}[report]()

    # ------------------------------------------------------------ live events
    def poll(self):
        """Listen to the mouse for a moment: battery, DPI stage and lighting changes made on the mouse itself."""
        if self.dpi is not None and not self.busy and self._save_job is None:
            def job(dev):
                return list(dev.events(theme.LISTEN_S)), dev.battery

            def done(r):
                events, battery = r
                if battery:
                    self.battery = battery
                for event, v0, _v1 in events:
                    if event == p.EV_DPI and 1 <= v0 <= config.STAGES and v0 != self.dpi["active"]:
                        self.dpi["active"] = v0
                        self.load()
                self.last_seen = time.time() if events else self.last_seen
                online = time.time() - self.last_seen < theme.OFFLINE_S
                self.set_connected(self.conn() if online else None)
            self.run("", job, done, quiet=True)
        self.after(theme.POLL_MS, self.poll)

    # ------------------------------------------------------------ backups
    def backup(self):
        path = filedialog.asksaveasfilename(parent=self, defaultextension=".json",
                                            initialfile=f"x11-backup-{time.strftime('%Y%m%d-%H%M')}.json")
        if path and self.dpi is not None:
            data = dict(dpi=config.encode_dpi(self.dpi).hex(), light=config.encode_light(self.light).hex(),
                        polling=self.polling, buttons=[a if isinstance(a, str) else list(a) for a in self.buttons])
            with open(path, "w") as f:
                json.dump(data, f, indent=2)
            self.set_status(_("Backup salvo em {}").format(path))

    def restore(self):
        path = filedialog.askopenfilename(parent=self, filetypes=[(_("Backup"), "*.json")])
        if not path:
            return
        try:
            with open(path) as f:
                b = json.load(f)
            dpi = config.decode_dpi(bytes.fromhex(b["dpi"]))
            light = config.decode_light(bytes.fromhex(b["light"]))
            buttons = [a if isinstance(a, str) else tuple(a) for a in b["buttons"]]
            config.encode_buttons(buttons)
            config.encode_polling(b["polling"])
        except (OSError, ValueError, KeyError, TypeError) as e:
            return messagebox.showerror(_("Erro"), _("Arquivo inválido: {}").format(e), parent=self)
        if not messagebox.askyesno(_("Restaurar"), _("Substituir as configurações do mouse por este backup?"),
                                   parent=self):
            return
        self.dpi, self.light, self.polling, self.buttons = dpi, light, b["polling"], buttons
        self.load()
        for r in (p.DPI, p.LIGHT, p.POLLING, p.BUTTONS):
            self.dirty.add(r)
        self.autosave()

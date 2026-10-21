# Changelog

This project follows [Semantic Versioning](https://semver.org/).

## 0.1.0-beta.4 — 2026-10-20

* `x11gui web` opens the browser version (WebHID). Its source moved into `web/` of this repository and it is served at <https://miguelsanzbr.github.io/attackshark-x11-linux/>.
* README: install the Flatpak from the signed repository on GitHub Pages.

## 0.1.0-beta.3 — 2026-10-15

* Flatpak: AppStream metadata, desktop entry and icon under the app ID `io.github.miguelsanzbr.attackshark-x11-linux` (`packaging/flatpak/`), ready for a
  Flathub submission. The Flatpak build bundles Tcl/Tk 8.6 and tkinter, which the Freedesktop runtime lacks.

## 0.1.0-beta.2 — 2026-10-14

* The drawing lights up each button while it is pressed on the mouse, with a short fade after release; the
  wheel flashes when it scrolls and the DPI button when it changes the stage (which also updates the DPI tab).
  The clicks are read from the receiver's mouse interface (read-only, alongside the system); a button lights
  when the function it is mapped to arrives, media keys included.

## 0.1.0-beta.1 — 2026-10-14

* First version: `x11ctl` (command line) and `x11gui` (Tk interface) for the ATTACK SHARK X11, through its
  2.4G receiver or the USB cable. DPI stages (up to 8, colour per stage, active stage), polling rate, angle
  snap, ripple control, button response time, remapping of the five buttons (mouse functions, media keys,
  keyboard shortcuts), lighting (7 effects, colour, brightness, speed), sleep and deep-sleep timers, battery
  level, JSON backup/restore. English and Brazilian Portuguese interface.
* Not yet: macros (three header bytes of the macro report are not understood).

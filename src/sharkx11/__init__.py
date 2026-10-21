"""sharkx11 — open-source Linux configurator for the ATTACK SHARK X11 wireless mouse.

* :mod:`sharkx11.protocol`  — constants, checksum, framing and the DPI encoding (pure functions).
* :mod:`sharkx11.discovery` — finds the mouse's settings ``hidraw`` node.
* :mod:`sharkx11.device`    — :class:`~sharkx11.device.Device`, the transport (read, write with ACK, events).
* :mod:`sharkx11.config`    — encode/decode of each settings report.
* :mod:`sharkx11.cli`       — the ``x11ctl`` command.
* :mod:`sharkx11.gui`       — the ``x11gui`` Tk interface.
"""

__version__ = "0.1.0b4"

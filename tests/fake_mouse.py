"""Emulator of the X11 behind its receiver, wired into sharkx11.device in place of the real hidraw node.

Feature reports go through a patched ``fcntl.ioctl``; input reports (events) come out of a socketpair whose
host end stands in for the hidraw file descriptor.
"""
import os
import socket

from sharkx11 import config, device, discovery, protocol as p


class FakeMouse:
    def __init__(self, pid=p.PID_RECEIVER, model=p.MODEL_X11):
        self.pid, self.model = pid, model
        self.path = "/dev/hidraw-fake"
        dpi = config.encode_dpi(config.default_dpi())
        light = config.encode_light(config.default_light())
        self.reports = {p.IDENT: bytes([p.IDENT, 8, 0x01, 0x12, 0, 0, 0, 0]), p.DPI: dpi, p.LIGHT: light,
                        p.POLLING: config.encode_polling(1000)}
        self.buttons = None            # last button map written
        self.pending = None            # report asked for with 0xA0
        self.log = []                  # every feature report set
        self.silent = False            # never ACK writes
        self.status = 0                # ACK status byte
        self.refuse_reads = 0          # answer the next N read requests with 0xA0 byte1 = 0
        self.heartbeat = (1, 84)       # battery heartbeat sent with each read request (the X11 sends one every
                                       # 2 s); None = silent mouse
        self.host, self._dev = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET)
        self.host.setblocking(False)

    def install(self, monkeypatch):
        real_open, real_close = os.open, os.close        # device.os is the os module: keep the originals
        monkeypatch.setattr(discovery, "find_devices", lambda: iter([(self.path, self.pid)]))
        monkeypatch.setattr(device.os, "open",
                            lambda path, flags, *a: self.host.fileno() if path == self.path else real_open(path, flags, *a))
        monkeypatch.setattr(device.os, "close", lambda fd: None if fd == self.host.fileno() else real_close(fd))
        monkeypatch.setattr(device.fcntl, "ioctl", self.ioctl)
        return self

    def close(self):
        self.host.close()
        self._dev.close()

    def event(self, ev, v0=0, v1=0, model=None):
        """Send an input report 0x03 to the host."""
        self._dev.send(bytes([0x03, self.model if model is None else model, ev, v0, v1]))

    def ioctl(self, fd, req, buf):
        nr, size = req & 0xFF, req >> 16 & 0x3FFF
        assert fd == self.host.fileno() and size == len(buf)
        if nr == 0x06:                                  # HIDIOCSFEATURE
            data = bytes(buf)
            self.log.append(data)
            if data[0] == p.READ_REQ:
                self.pending = data[1]
                if self.heartbeat:
                    self.event(p.EV_BATTERY, *self.heartbeat)
                return 0
            if data[0] == p.BUTTONS:
                self.buttons = data
            else:
                self.reports[data[0]] = data
            if self.pid == p.PID_RECEIVER and not self.silent:
                self.event(p.EV_ACK, self.status)
            return 0
        rid = buf[0]                                    # HIDIOCGFEATURE
        if rid == p.READ_REQ:
            ok = self.pending is not None and not self.refuse_reads
            self.refuse_reads = max(self.refuse_reads - 1, 0)
            buf[:] = bytes([p.READ_REQ, int(ok)] + [0] * 6)
        else:
            buf[:] = self.reports[rid]
        return 0

"""Transport to the mouse over ``/dev/hidraw``: feature reports (settings) and input report 0x03 (events)."""
import fcntl
import os
import select
import sys
import time

from . import discovery, protocol as p

ACK_TRIES, ACK_WAIT = 10, 0.5        # the app resends every 500 ms until the mouse ACKs, at most 10 times
READ_WAIT = {p.PID_RECEIVER: 0.5, p.PID_WIRED: 0.1}   # pause between the read request and the answer


def _ioc(nr, size):
    return (3 << 30) | (size << 16) | (ord("H") << 8) | nr        # _IOC(_IOC_READ|_IOC_WRITE, 'H', nr, size)


class Device:
    """The mouse's settings interface. Exits with a message (``SystemExit``) when there is no mouse or no
    permission. ``model`` and ``battery`` (``(charging, percent)``) fill in from the events it sees."""

    def __init__(self, path=None):
        devs = list(discovery.find_devices())
        if path:
            devs = [d for d in devs if d[0] == path] or [(path, p.PID_RECEIVER)]
        if not devs:
            sys.exit("no ATTACK SHARK receiver or mouse found (is the receiver plugged in?)")
        self.path, self.pid = devs[0]
        try:
            self.fd = os.open(self.path, os.O_RDWR | os.O_NONBLOCK)
        except PermissionError:
            sys.exit(f"permission denied on {self.path}: install udev/70-attackshark-x11.rules (see README)")
        self.model = self.battery = None

    def close(self):
        os.close(self.fd)

    # ------------------------------------------------------------ raw I/O
    def set_feature(self, data):
        fcntl.ioctl(self.fd, _ioc(0x06, len(data)), bytearray(data))

    def get_feature(self, rid, size):
        buf = bytearray(size)
        buf[0] = rid
        fcntl.ioctl(self.fd, _ioc(0x07, size), buf)
        return bytes(buf)

    def events(self, timeout):
        """Yield ``(event, v0, v1)`` for every input report 0x03 within ``timeout`` seconds (also updates
        ``model`` and ``battery``)."""
        end = time.time() + timeout
        while (left := end - time.time()) > 0:
            if not select.select([self.fd], [], [], left)[0]:
                return
            ev = p.parse_event(os.read(self.fd, 64))
            if ev:
                model, event, v0, v1 = ev
                self.model = model
                if event == p.EV_BATTERY:
                    self.battery = (v0 == p.CHARGING, v1)
                yield event, v0, v1

    def _wait(self, seconds):
        for _ in self.events(seconds):
            pass

    # ------------------------------------------------------------ settings
    def read(self, rid):
        """One settings report, by the app's handshake: request 0xA0, check its answer, then fetch."""
        size = p.SIZES[rid]
        for _ in range(3):
            self.set_feature(p.read_request(rid, 0 if rid == p.IDENT else 1))
            self._wait(READ_WAIT[self.pid])
            if self.get_feature(p.READ_REQ, p.SIZES[p.READ_REQ])[1] == 1:
                r = self.get_feature(rid, size)
                if r[0] == rid and r[1] == size:
                    return r
        raise IOError(f"no answer to the read of report {rid:#04x} (is the mouse on?)")

    def write(self, data):
        """Send one settings report; through the receiver, resend until the mouse ACKs (``03 <model> 50 00``)."""
        if data[0] not in p.WRITABLE or len(data) != p.SIZES[data[0]]:
            raise ValueError(f"refusing to send report {data[0]:#04x} ({len(data)} bytes)")
        for _ in range(ACK_TRIES):
            self.set_feature(data)
            if self.pid == p.PID_WIRED:          # on the cable the feature write itself is the confirmation
                return
            for event, v0, _v1 in self.events(ACK_WAIT):
                if event == p.EV_ACK:
                    if v0 != 0:
                        raise IOError(f"mouse rejected report {data[0]:#04x} (status {v0})")
                    return
        raise IOError(f"no confirmation for report {data[0]:#04x} (is the mouse on?)")

    def identify(self):
        """``(model id, version byte)`` from report 0x0B."""
        r = self.read(p.IDENT)
        self.model = r[2]
        return r[2], r[3]

    def wait_battery(self, timeout=6.0):
        """The battery state, waiting for the mouse's heartbeat if none was seen yet."""
        if self.battery is None:
            for event, _v0, _v1 in self.events(timeout):
                if event == p.EV_BATTERY:
                    break
        return self.battery

"""Read-only probe of an ATTACK SHARK mouse: listen to its input reports, then read the settings reports.

Nothing is written to the mouse except the app's read request (feature report 0xA0), which only asks the
receiver to fetch a settings report. Usage: python3 tools/probe.py /dev/hidrawN [seconds]
"""
import fcntl
import os
import select
import sys
import time


def ioc(nr, size):
    return (3 << 30) | (size << 16) | (ord("H") << 8) | nr    # _IOC(_IOC_READ|_IOC_WRITE, 'H', nr, size)


def set_feature(fd, data):
    fcntl.ioctl(fd, ioc(0x06, len(data)), bytearray(data))


def get_feature(fd, rid, size):
    buf = bytearray(size)
    buf[0] = rid
    fcntl.ioctl(fd, ioc(0x07, size), buf)
    return bytes(buf)


def listen(fd, seconds):
    end = time.time() + seconds
    while (left := end - time.time()) > 0:
        if select.select([fd], [], [], left)[0]:
            r = os.read(fd, 64)
            print(f"  {time.time() % 1000:8.2f} input {r.hex(' ')}")


def read_report(fd, rid, size, flag):
    set_feature(fd, bytes([0xA0, rid, size, 0, flag, 0, 0, 0]))
    listen(fd, 0.5)
    ack = get_feature(fd, 0xA0, 8)
    print(f"  a0 answer {ack.hex(' ')}")
    r = get_feature(fd, rid, size)
    s = sum(r[3:-4]) & 0xFFFF if size > 9 else None
    print(f"  report {rid:#04x} ({size}) {r.hex(' ')}" + (f"   sum(3..) candidates: {s:#06x}" if s is not None else ""))
    return r


def main():
    path = sys.argv[1]
    secs = float(sys.argv[2]) if len(sys.argv) > 2 else 8
    fd = os.open(path, os.O_RDWR)
    print(f"listening {secs:g}s for input reports (move/click the mouse)...")
    listen(fd, secs)
    for rid, size, flag in ((0x0B, 8, 0), (0x06, 9, 1), (0x05, 15, 1), (0x04, 56, 1)):
        print(f"read {rid:#04x}")
        try:
            read_report(fd, rid, size, flag)
        except OSError as e:
            print(f"  error {e}")
    os.close(fd)


if __name__ == "__main__":
    main()

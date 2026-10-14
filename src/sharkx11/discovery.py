"""Find the mouse's settings ``hidraw`` node in sysfs: interface 2 of the receiver or of the wired mouse."""
import glob
import os

from . import protocol

SYS, DEV = "/sys", "/dev"   # roots, overridable by tests
SETTINGS_COLLECTION = b"\x05\x0b\x09\x00"   # usage page 0x0B, usage 0: the feature (settings) collection


def _read(path):
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError:
        return b""


def find_devices():
    """Yield ``(hidraw_path, pid)`` for every receiver/wired mouse settings interface, receiver first."""
    found = []
    for d in sorted(glob.glob(SYS + "/class/hidraw/hidraw*")):
        ue = _read(d + "/device/uevent").decode(errors="replace")
        hid_id = next((l.split("=")[1] for l in ue.splitlines() if l.startswith("HID_ID=")), "")
        try:
            _, vid, pid = (int(x, 16) for x in hid_id.split(":"))
        except ValueError:
            continue
        if vid == protocol.VID and pid in protocol.PIDS and \
                SETTINGS_COLLECTION in _read(d + "/device/report_descriptor"):
            found.append((DEV + "/" + os.path.basename(d), pid))
    yield from sorted(found, key=lambda f: f[1] != protocol.PID_RECEIVER)

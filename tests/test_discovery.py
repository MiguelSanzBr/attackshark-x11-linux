import os

from sharkx11 import discovery, protocol as p

DESC_SETTINGS = bytes.fromhex("05 01 09 80 a1 01 c0 05 0b 09 00 a1 01 85 04 c0")


def make(tmp_path, name, hid_id, desc):
    d = tmp_path / "sys/class/hidraw" / name / "device"
    d.mkdir(parents=True)
    (d / "uevent").write_text(f"HID_ID={hid_id}\nHID_NAME=x\n")
    (d / "report_descriptor").write_bytes(desc)


def test_find_devices(tmp_path, monkeypatch):
    monkeypatch.setattr(discovery, "SYS", str(tmp_path / "sys"))
    monkeypatch.setattr(discovery, "DEV", "/dev")
    make(tmp_path, "hidraw1", "0003:00001D57:0000FA55", DESC_SETTINGS)          # wired mouse
    make(tmp_path, "hidraw2", "0003:00001D57:0000FA60", b"\x05\x01\x09\x06")    # receiver keyboard interface
    make(tmp_path, "hidraw3", "0003:00001D57:0000FA60", DESC_SETTINGS)          # receiver settings interface
    make(tmp_path, "hidraw4", "0003:00002DC8:00006013", DESC_SETTINGS)          # someone else
    make(tmp_path, "hidraw5", "garbage", b"")
    os.makedirs(tmp_path / "sys/class/hidraw/hidraw6")                          # no device dir at all
    assert list(discovery.find_devices()) == [("/dev/hidraw3", p.PID_RECEIVER), ("/dev/hidraw1", p.PID_WIRED)]


def test_find_mouse_node(tmp_path, monkeypatch):
    monkeypatch.setattr(discovery, "SYS", str(tmp_path / "sys"))
    usb = tmp_path / "devices/3-1"
    for iface, name, desc in (("3-1:1.1", "hidraw4", bytes.fromhex("05 01 09 02 a1 01 09 01")),
                              ("3-1:1.2", "hidraw5", DESC_SETTINGS)):
        dev = usb / iface / "0003:1D57:FA60.0001"
        dev.mkdir(parents=True)
        (dev / "report_descriptor").write_bytes(desc)
        link = tmp_path / "sys/class/hidraw" / name
        link.mkdir(parents=True)
        os.symlink(dev, link / "device")
    other = tmp_path / "devices/1-1/1-1:1.0/x"
    other.mkdir(parents=True)
    (other / "report_descriptor").write_bytes(bytes.fromhex("05 01 09 02 a1 01"))
    (tmp_path / "sys/class/hidraw/hidraw9").mkdir()
    os.symlink(other, tmp_path / "sys/class/hidraw/hidraw9/device")
    assert discovery.find_mouse_node("/dev/hidraw5") == "/dev/hidraw4"
    (usb / "3-1:1.1/0003:1D57:FA60.0001/report_descriptor").write_bytes(b"\x05\x01\x09\x06")
    assert discovery.find_mouse_node("/dev/hidraw5") is None

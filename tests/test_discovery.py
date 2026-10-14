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

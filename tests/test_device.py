import pytest

from sharkx11 import config, device, discovery, protocol as p


def test_open_errors(monkeypatch):
    monkeypatch.setattr(discovery, "find_devices", lambda: iter([]))
    with pytest.raises(SystemExit, match="no ATTACK SHARK"):
        device.Device()
    monkeypatch.setattr(discovery, "find_devices", lambda: iter([("/dev/x", p.PID_RECEIVER)]))

    def denied(*a):
        raise PermissionError
    monkeypatch.setattr(device.os, "open", denied)
    with pytest.raises(SystemExit, match="70-attackshark-x11.rules"):
        device.Device("/dev/other")


def test_read_identify_and_events(fake):
    d = device.Device(fake.path)
    assert d.path == fake.path and d.pid == p.PID_RECEIVER
    fake.event(p.EV_BATTERY, 3, 87)
    fake._dev.send(bytes([0x02, 0xE9, 0x00]))               # a consumer-key report is not an event
    assert d.identify() == (0x55, 0x12) and d.battery == (True, 87)
    assert config.decode_dpi(d.read(p.DPI))["active"] == 2
    assert fake.log[-1] == p.read_request(p.DPI)
    fake.refuse_reads = 1                                     # first handshake refused, second accepted
    assert d.read(p.POLLING)[3] == 1
    fake.refuse_reads = 5
    with pytest.raises(IOError, match="0x06"):
        d.read(p.POLLING)
    d.close()


def test_read_checks_the_answer(fake):
    d = device.Device()
    fake.reports[p.POLLING] = bytes([6, 8, 1, 1, 0xFE, 0, 0, 0, 0])      # wrong length byte
    with pytest.raises(IOError):
        d.read(p.POLLING)


def test_write_waits_for_ack(fake):
    d = device.Device()
    d.write(config.encode_polling(250))
    assert fake.reports[p.POLLING][3] == 4 and d.model == 0x55
    fake.status = 2
    with pytest.raises(IOError, match="rejected"):
        d.write(config.encode_polling(250))
    fake.status, fake.silent = 0, True
    fake.event(p.EV_DPI, 2)                                 # unrelated events do not count as an ACK
    with pytest.raises(IOError, match="no confirmation"):
        d.write(config.encode_polling(250))
    assert len([r for r in fake.log if r[0] == p.POLLING]) == 2 + device.ACK_TRIES


def test_write_refuses_unknown_reports(fake):
    d = device.Device()
    for data in (bytes([0x0C, 0x0A, 1, 0xFE, 1, 0xFE, 0, 0, 0, 0]), bytes([0x06, 9, 1, 1, 0xFE, 0, 0, 0])):
        with pytest.raises(ValueError, match="refusing"):
            d.write(data)
    assert not fake.log


def test_wired_write_needs_no_ack(fake):
    fake.pid = p.PID_WIRED
    d = device.Device()
    fake.silent = True
    d.write(config.encode_buttons(config.DEFAULT_MAP))
    assert fake.buttons[3:6] == bytes([2, 0, 0])


def test_wait_battery(fake):
    d = device.Device()
    assert d.wait_battery(0.05) is None and list(d.events(0)) == []
    fake.event(p.EV_DPI, 1)
    fake.event(p.EV_BATTERY, 1, 64)
    assert d.wait_battery(1) == (False, 64)
    assert d.wait_battery(0) == (False, 64)                 # already known: no wait

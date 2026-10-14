import pytest

from sharkx11 import protocol as p


def test_checksum_and_read_request():
    assert p.checksum(bytes([0xFF] * 300)) == bytes([0x2A, 0xD4])       # 300 * 255 = 76500 -> 0x12AD4
    assert p.read_request(p.DPI) == bytes([0xA0, 0x04, 56, 0, 1, 0, 0, 0])
    assert p.read_request(p.IDENT, 0)[4] == 0


def test_parse_event():
    assert p.parse_event(bytes([3, 0x55, 0x40, 1, 87])) == (0x55, 0x40, 1, 87)
    assert p.parse_event(bytes([2, 0x55, 0x40, 1, 87])) is None and p.parse_event(b"\x03\x55") is None


@pytest.mark.parametrize("dpi,step", [(50, 1), (800, 16), (10000, 200), (10100, 201), (22000, 320)])
def test_dpi_steps(dpi, step):
    assert p.dpi_to_step(dpi) == step and p.step_to_dpi(step) == dpi


@pytest.mark.parametrize("dpi", [0, 40, 825, 10150, 22100])
def test_dpi_rejects(dpi):
    with pytest.raises(ValueError):
        p.dpi_to_step(dpi)


def test_encoding_follows_the_sensor_formula():
    for n in range(1, 321):
        code, low, high = p.encode_step(n)
        assert abs(code * 42.55 * 2 ** (low + high) - p.step_to_dpi(n)) < 90      # within one code step
    assert p.encode_step(301) == (118, 1, 1) and p.encode_step(320) == (p.T[210], 1, 1)   # no 40000-DPI slip
    assert p.encode_step(221) == (p.T[121], 0, 1) and p.encode_step(210) == (p.T[210], 1, 0)


def test_decode_round_trips_and_falls_back_to_the_formula():
    assert all(p.decode_step(*p.encode_step(n)) == n for n in range(1, 302))
    assert p.decode_step(*p.encode_step(302)) == 303           # above 20000 DPI steps can share a code
    assert p.decode_step(*p.encode_step(320)) == 320
    assert p.step_to_dpi(p.decode_step(100, 1, 1)) == 17000    # unknown triple: nearest by the formula

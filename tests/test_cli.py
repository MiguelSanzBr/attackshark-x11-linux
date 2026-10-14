import json

import pytest

from sharkx11 import cli, config, protocol as p


@pytest.fixture(autouse=True)
def cfg(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))


def test_list_and_actions(fake, capsys):
    cli.main(["list"])
    cli.main(["actions"])
    out = capsys.readouterr().out
    assert "/dev/hidraw-fake  1d57:fa60  2.4G receiver" in out and "volume_up" in out and "key:ctrl+c" in out


def test_info(fake, capsys):
    fake.heartbeat = (3, 77)
    cli.main(["info"])
    out = capsys.readouterr().out
    assert "X11 (id 0x55)" in out and "77% (charging)" in out and "*1600" in out and "1000 Hz" in out
    assert "deep sleep 10 min" in out


def test_info_without_battery(fake, capsys, monkeypatch):
    monkeypatch.setattr(cli.device.Device, "wait_battery", lambda self: None)
    cli.main(["info"])
    assert "unknown (move the mouse)" in capsys.readouterr().out


def test_dump(fake, capsys, tmp_path):
    cli.main(["dump"])
    doc = json.loads(capsys.readouterr().out)
    assert doc["polling"] == 1000 and doc["buttons"][0] == "left" and len(doc["dpi"]["raw"]) == 112
    cli.main(["dump", "-o", str(tmp_path / "d.json")])
    assert json.loads((tmp_path / "d.json").read_text())["light"]["mode"] == "off"


def test_dpi(fake, capsys):
    cli.main(["dpi", "--stages", "400,12100", "--colors", "#010203,#040506", "--active", "2",
              "--angle-snap", "on", "--ripple", "off"])
    doc = config.decode_dpi(fake.reports[p.DPI])
    assert [s["dpi"] for s in doc["stages"] if s["on"]] == [400, 12100] and doc["active"] == 2
    assert doc["angle_snap"] and not doc["ripple"] and doc["stages"][1]["color"] == "#040506"
    n = len(fake.log)
    cli.main(["dpi"])                                         # show only: nothing written
    assert not [r for r in fake.log[n:] if r[0] == p.DPI] and "*12100" in capsys.readouterr().out
    cli.main(["dpi", "--ripple", "on"])
    assert config.decode_dpi(fake.reports[p.DPI])["ripple"]


def test_dpi_errors(fake):
    with pytest.raises(SystemExit, match="1 to 8"):
        cli.main(["dpi", "--stages", ",".join(["800"] * 9)])
    with pytest.raises(SystemExit, match="DPI must be"):
        cli.main(["dpi", "--stages", "825"])


def test_polling_light_power(fake, capsys):
    cli.main(["polling", "500"])
    cli.main(["light", "--mode", "static", "--color", "#ff0000", "--brightness", "5", "--speed", "2"])
    cli.main(["power", "--sleep", "5", "--deep-sleep", "20", "--debounce", "8"])
    assert fake.reports[p.POLLING][3] == 2
    lt = config.decode_light(fake.reports[p.LIGHT])
    assert (lt["mode"], lt["color"], lt["brightness"], lt["speed"], lt["sleep"], lt["deep_sleep"], lt["debounce"]) == \
           ("static", "#ff0000", 5, 2, 5, 20, 8)
    assert "500 Hz" in capsys.readouterr().out


def test_buttons(fake, capsys):
    cli.main(["button", "forward", "key:ctrl+shift+s"])
    cli.main(["button", "back", "volume_down"])
    cli.main(["buttons"])
    out = capsys.readouterr().out
    assert "forward  key:ctrl+shift+s" in out and "back     volume_down" in out
    assert fake.buttons[21:24] == bytes([0x11, 3, 0x16])
    cli.main(["buttons", "--reset"])
    assert fake.buttons == config.encode_buttons(config.DEFAULT_MAP)
    for bad in ("teleport", "key:hyper+s"):
        with pytest.raises(SystemExit, match="unknown"):
            cli.main(["button", "forward", bad])


def test_backup_restore(fake, tmp_path, capsys):
    cli.main(["button", "forward", "key:alt+f4"])
    cli.main(["backup", str(tmp_path / "b.json")])
    cli.main(["polling", "125"])
    cli.main(["button", "forward", "off"])
    cli.main(["restore", str(tmp_path / "b.json")])
    assert fake.reports[p.POLLING][3] == 1 and fake.buttons[21:24] == bytes([0x11, 4, 0x3D])
    assert "restored" in capsys.readouterr().out

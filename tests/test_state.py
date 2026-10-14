import json

from sharkx11 import config, state


def test_buttons_round_trip_and_fallbacks(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    assert state.load_buttons() == config.DEFAULT_MAP                      # nothing saved yet
    m = list(config.DEFAULT_MAP)
    m[6] = ("key", 1, 0x06)
    state.save_buttons(m)
    assert state.load_buttons() == m
    (tmp_path / "sharkx11/buttons.json").write_text(json.dumps(["right"] * 18))   # no left click: unusable
    assert state.load_buttons() == config.DEFAULT_MAP
    (tmp_path / "sharkx11/buttons.json").write_text("{")
    assert state.load_buttons() == config.DEFAULT_MAP

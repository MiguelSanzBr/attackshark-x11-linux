"""The button map lives here as well as in the mouse: the mouse cannot report it back, so (like the official
app) the last map written is kept in ``~/.config/sharkx11/buttons.json``."""
import json
import os

from . import config


def path():
    return os.path.join(os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config"), "sharkx11",
                        "buttons.json")


def load_buttons():
    """The saved map, or the factory map when nothing was saved (or the file is unusable)."""
    try:
        with open(path(), encoding="utf-8") as f:
            data = json.load(f)
        mapping = [a if isinstance(a, str) else tuple(a) for a in data]
        config.encode_buttons(mapping)                  # validates
        return mapping
    except (OSError, ValueError, TypeError):
        return list(config.DEFAULT_MAP)


def save_buttons(mapping):
    os.makedirs(os.path.dirname(path()), exist_ok=True)
    with open(path(), "w", encoding="utf-8") as f:
        json.dump([a if isinstance(a, str) else list(a) for a in mapping], f)

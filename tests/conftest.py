import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fake_mouse import FakeMouse  # noqa: E402
from sharkx11 import device  # noqa: E402


@pytest.fixture
def fake(monkeypatch):
    monkeypatch.setattr(device, "READ_WAIT", {k: 0.01 for k in device.READ_WAIT})
    monkeypatch.setattr(device, "ACK_WAIT", 0.05)
    f = FakeMouse().install(monkeypatch)
    yield f
    f.close()

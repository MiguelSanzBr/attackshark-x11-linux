#!/usr/bin/env python3
"""Run x11gui from a git checkout without installing it."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "src"))
from sharkx11.gui.app import main  # noqa: E402

main()

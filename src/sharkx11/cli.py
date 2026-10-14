"""``x11ctl``: read and change the ATTACK SHARK X11's settings from the command line."""
import argparse
import json
import sys

from . import config, device, discovery, protocol as p, state


def parser():
    ap = argparse.ArgumentParser(prog="x11ctl", description="Configure the ATTACK SHARK X11 mouse on Linux.")
    ap.add_argument("-d", "--device", help="hidraw node (default: auto-detect)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="list detected receivers / mice")
    sub.add_parser("info", help="model, battery and current settings")
    d = sub.add_parser("dump", help="all settings as JSON")
    d.add_argument("-o", "--output")
    d = sub.add_parser("dpi", help="DPI stages, active stage, angle snap, ripple control")
    d.add_argument("--stages", help="comma-separated DPI values for stages 1..n (the rest are disabled)")
    d.add_argument("--colors", help="comma-separated #rrggbb colours for stages 1..n")
    d.add_argument("--active", type=int, help="active stage (1..8)")
    d.add_argument("--angle-snap", choices=("on", "off"))
    d.add_argument("--ripple", choices=("on", "off"))
    d = sub.add_parser("polling", help="polling rate")
    d.add_argument("rate", type=int, choices=sorted(p.POLLING_CODES))
    d = sub.add_parser("light", help="lighting")
    d.add_argument("--mode", choices=config.LIGHT_MODES)
    d.add_argument("--color", help="#rrggbb")
    d.add_argument("--brightness", type=int, help="1..8 (static modes only)")
    d.add_argument("--speed", type=int, help="1..5")
    d = sub.add_parser("power", help="sleep timers and button debounce")
    d.add_argument("--sleep", type=int, help="minutes to sleep, 1..60")
    d.add_argument("--deep-sleep", type=int, help="minutes to deep sleep, 1..60")
    d.add_argument("--debounce", type=int, help="button debounce in ms, 2..25")
    d = sub.add_parser("button", help="remap a button: left right middle dpi forward back")
    d.add_argument("button", choices=list(config.BUTTONS))
    d.add_argument("action", help="an action (see 'x11ctl actions') or a shortcut such as key:ctrl+shift+s")
    sub.add_parser("buttons", help="show the button map").add_argument("--reset", action="store_true",
                                                                        help="write the factory map")
    sub.add_parser("actions", help="list button actions")
    d = sub.add_parser("backup", help="save the settings to a JSON file")
    d.add_argument("file")
    d = sub.add_parser("restore", help="write the settings from a backup file")
    d.add_argument("file")
    return ap


def action_text(act):
    return act if isinstance(act, str) else "key:" + config.shortcut_text(act)


def parse_action(text):
    return config.parse_shortcut(text[4:]) if text.startswith("key:") else text


def read_all(dev):
    return dict(dpi=config.decode_dpi(dev.read(p.DPI)), light=config.decode_light(dev.read(p.LIGHT)),
                polling=config.decode_polling(dev.read(p.POLLING))["rate"], buttons=state.load_buttons())


def show(doc):
    print("dpi stages  " + "  ".join(f"{'*' if i + 1 == doc['dpi']['active'] else ''}{s['dpi']}"
                                     for i, s in enumerate(doc["dpi"]["stages"]) if s["on"]))
    print(f"angle snap  {'on' if doc['dpi']['angle_snap'] else 'off'}   ripple control "
          f"{'on' if doc['dpi']['ripple'] else 'off'}")
    print(f"polling     {doc['polling']} Hz")
    lt = doc["light"]
    print(f"light       {lt['mode']} {lt['color']} brightness {lt['brightness']} speed {lt['speed']}")
    print(f"power       sleep {lt['sleep']} min, deep sleep {lt['deep_sleep']} min, debounce {lt['debounce']} ms")


def as_json(doc):
    out = {k: dict(v) if isinstance(v, dict) else v for k, v in doc.items()}
    for k in ("dpi", "light"):
        out[k]["raw"] = out[k]["raw"].hex()
    out["buttons"] = [action_text(a) for a in doc["buttons"]]
    return out


def main(argv=None):
    a = parser().parse_args(argv)
    if a.cmd == "list":
        for path, pid in discovery.find_devices():
            print(f"{path}  {p.VID:04x}:{pid:04x}  {p.PIDS[pid]}")
        return
    if a.cmd == "actions":
        print("\n".join(sorted(config.ACTIONS)) + "\nkey:<mods+key>   e.g. key:ctrl+c, key:alt+f4, key:f5")
        return
    dev = device.Device(a.device)
    try:
        run(dev, a)
    except (ValueError, IOError) as e:
        sys.exit(f"error: {e}")
    finally:
        dev.close()


def run(dev, a):
    if a.cmd == "info":
        model, version = dev.identify()
        print(f"device      {dev.path} ({p.VID:04x}:{dev.pid:04x} {p.PIDS[dev.pid]})")
        print(f"model       {p.MODELS.get(model, '?')} (id 0x{model:02x}), version byte 0x{version:02x}")
        bat = dev.wait_battery()
        print("battery     " + ("unknown (move the mouse)" if bat is None else
                                f"{bat[1]}%{' (charging)' if bat[0] else ''}"))
        show(read_all(dev))
    elif a.cmd == "dump":
        text = json.dumps(as_json(read_all(dev)), indent=2)
        if a.output:
            with open(a.output, "w") as f:
                f.write(text + "\n")
        else:
            print(text)
    elif a.cmd == "dpi":
        doc = config.decode_dpi(dev.read(p.DPI))
        if a.stages:
            values = [int(v) for v in a.stages.split(",")]
            if not 1 <= len(values) <= config.STAGES:
                raise ValueError("give 1 to 8 DPI values")
            for i, s in enumerate(doc["stages"]):
                s["on"] = i < len(values)
                if i < len(values):
                    s["dpi"] = values[i]
        for i, col in enumerate(a.colors.split(",") if a.colors else []):
            doc["stages"][i]["color"] = col
        if a.active is not None:
            doc["active"] = a.active
        if a.angle_snap:
            doc["angle_snap"] = a.angle_snap == "on"
        if a.ripple:
            doc["ripple"] = a.ripple == "on"
        if a.stages or a.colors or a.active is not None or a.angle_snap or a.ripple:
            dev.write(config.encode_dpi(doc))
        show(dict(dpi=doc, light=config.decode_light(dev.read(p.LIGHT)),
                  polling=config.decode_polling(dev.read(p.POLLING))["rate"]))
    elif a.cmd == "polling":
        dev.write(config.encode_polling(a.rate))
        print(f"polling rate set to {a.rate} Hz")
    elif a.cmd in ("light", "power"):
        doc = config.decode_light(dev.read(p.LIGHT))
        for key in ("mode", "color", "brightness", "speed", "sleep", "deep_sleep", "debounce"):
            if getattr(a, key, None) is not None:
                doc[key] = getattr(a, key)
        dev.write(config.encode_light(doc))
        print("saved")
    elif a.cmd == "button":
        mapping = state.load_buttons()
        mapping[config.BUTTONS[a.button]] = parse_action(a.action)
        dev.write(config.encode_buttons(mapping))
        state.save_buttons(mapping)
        print(f"{a.button} -> {action_text(mapping[config.BUTTONS[a.button]])}")
    elif a.cmd == "buttons":
        mapping = list(config.DEFAULT_MAP) if a.reset else state.load_buttons()
        if a.reset:
            dev.write(config.encode_buttons(mapping))
            state.save_buttons(mapping)
        for name, slot in config.BUTTONS.items():
            print(f"{name:8} {action_text(mapping[slot])}")
    elif a.cmd == "backup":
        with open(a.file, "w") as f:
            json.dump(as_json(read_all(dev)), f, indent=2)
        print(f"saved to {a.file}")
    else:                                                   # restore
        with open(a.file) as f:
            b = json.load(f)
        mapping = [parse_action(t) for t in b["buttons"]]
        dpi = config.decode_dpi(bytes.fromhex(b["dpi"]["raw"]))
        light = config.decode_light(bytes.fromhex(b["light"]["raw"]))
        for data in (config.encode_dpi(dpi), config.encode_light(light), config.encode_polling(b["polling"]),
                     config.encode_buttons(mapping)):
            dev.write(data)
        state.save_buttons(mapping)
        print("restored")

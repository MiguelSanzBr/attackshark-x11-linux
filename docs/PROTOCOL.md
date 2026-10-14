# ATTACK SHARK X11 – HID configuration protocol

Reverse-engineered from the official Windows app (`AttackShark.exe`, x86 MSVC, image base 0x400000, and
`hiddriver_N.dll`) with REA + Ghidra; no code or artwork of the app is part of this project. Function
addresses refer to that build. Tags:
**CONFIRMED** = seen in decompiled/disassembled code (address given);
**GUESS** = inference, needs a live check.

---------------------------------------------------------------------------------------------------
## 0. TL;DR

* The X11 is model page **CMS_4** ("X11 Mouse", `option_device_4` in `res/main.xml`), model id
  byte **0x55** ('U'), wired PID **1d57:fa55**, receiver **1d57:fa60**, BT PID 0x0055,
  hiddriver_4.dll. Max DPI 22000 (slider 1..320). **CONFIRMED**
* Model selection is passive: the app reads INPUT report 0x03 on the receiver's usage-page-0x0A
  collection; **byte 1 is the model id**. No GetFeature is involved. **CONFIRMED**
* All configuration is FEATURE reports on the usage-page-0x0B collection (Linux: hidraw of
  interface 2). Write packet format: `[id, total_len, 0x01, payload..., csum_hi, csum_lo, 0...]`,
  checksum = 16-bit sum of bytes 3..(n-1), big-endian. **CONFIRMED**
* Read = handshake `SET 0xA0 [a0 id len 00 flag 00 00 00]` → `GET 0xA0` (byte1 must be 01) →
  `GET id`. **CONFIRMED**
* Each write is applied immediately; there is no separate "save to flash"/commit command.
  Over 2.4G the receiver ACKs each write with input report `03 55 50 00 ..`. **CONFIRMED** (no
  commit code exists in the app); "device persists to flash by itself" is a **GUESS**.
* No firmware-update/DFU code exists in the app. The one unexplained write is
  `0c 0a 01 fe 01 fe 00 00 00 00` (sent before a full re-sync) – do not send it.

---------------------------------------------------------------------------------------------------
## 1. Model selection (question 1)

### 1.1 Per-model pages and connection flags
* Main window `CMainWnd` (ctor `FUN_0040d6b0`, ctor.c) embeds 18 page objects. CMS_4 page base
  = main+0x133b50; its fields: +0x60 VID 0x1d57, +0x64 wired PID 0xfa55, +0x68 0x1d57,
  +0x6c 0xfa60 (receiver). **CONFIRMED** (ctor.c)
* Page flags (same layout for all pages): +0x3dc wired state (1 = present, 2 = removed),
  +0x3ec wireless online, +0x3e0 BLE online, +0x3e4 "show this model" (= any of them).
  **CONFIRMED** (FUN_004a14a0, FUN_004a34f0, FUN_0049d8b0).

### 1.2 Wired (USB cable) path – via hiddriver_N.dll
* `FUN_0049e4c0` @0x49e653: `Set_VIDPID(0x1d57, 0xfa55)`, `Open_DevMonitor(hwnd, 0x633, 0x634)`,
  `Open_FeatureDevice()`. **CONFIRMED**
* hiddriver `FUN_10001d70`: the feature handle is the HID collection with UsagePage 0x0B,
  Usage 0, matching VID/PID; the monitor (input) handle is UsagePage 0x0A, Usage 0.
  `FUN_10001a70`: when an input report with id 0x03 arrives it posts
  `PostMessage(hwnd, 0x633, *(u16*)&buf[1], *(u16*)&buf[3])`. Arrival/removal of the device posts
  0x634. **CONFIRMED**
* Main window `FUN_0040f9a0`: 0x633 → `FUN_004a14a0(page4, wParam<<16 | lParam)`; 0x634 →
  connect/disconnect (`0x7f000001` / `0x7f000002`). **CONFIRMED**

### 1.3 2.4 GHz receiver path (the user's setup) – via hidapi
1. WM_DEVICECHANGE arrival containing `VID_1D57`+`PID_FA60` → timer 0x36 (1 s)
   (`FUN_004111e0`). (`PID_FA65` → timer 0x37: a second receiver type, 4K variant – GUESS.)
2. Timer 0x36 → `FUN_004130c0`: `hid_enumerate(0x1d57, 0xfa60)`; for every collection with
   usage 0: UsagePage 0x0B → stored as feature handle list, UsagePage 0x0A → "OSD" input handle
   list; one reader thread per input handle (`FUN_0040d230`...). **CONFIRMED**
3. Reader `FUN_004137b0`: `hid_read(osd, buf, 100)`. On the **first** report read from an input
   handle it maps `buf[1]` to a model index and binds the matching feature handle to that page
   (`FUN_00413a20`, page4 feature handle stored at page+0x65c94). **CONFIRMED**

   | buf[1] | page | name (main.xml) | | buf[1] | page | name |
   |---|---|---|---|---|---|---|
   | 0x85 | CMS_1 | X6 | | 0x07 | CMS_10 | X11SE |
   | 0x4D | CMS_2 | X3 | | 0x02 | CMS_11 | X8SE |
   | 0x10 | CMS_3 | R1 | | 0x06 | CMS_12 | X8 Plus |
   | **0x55** | **CMS_4** | **X11** | | 0x08 | CMS_13 | X8 PRO |
   | 0x4E | CMS_5 | X3MAX | | 0x04 | CMS_14 | G3 |
   | 0xB1 | CMS_6 | X1 | | 0x0E | CMS_15 | G3 PRO |
   | 0xBE | CMS_7 | X11PRO | | 0xE5 | CMS_16 | V3 PRO |
   | 0x01 | CMS_8 | X3PRO | | 0x24 | CMS_17 | V6 |
   | 0x03 | CMS_9 | V5SE | | 0xEA | CMS_18 | V3 |

4. Every later report goes through `FUN_00413fe0`: if `buf[0]==0x03 && buf[1]==model id`, the
   page's 6 s watchdog timer is restarted (CMS_4: timer 0x230, 6000 ms) and the page is marked
   online (`FUN_004a34f0(page,1)`), then the event is decoded (§4). When the timer expires the page
   goes offline. **CONFIRMED**
5. On going online, CMS_4 posts 0x636 → thread message 0x630 wParam=1 → full read from device
   (`FUN_004a38a0`, §3.2). **CONFIRMED** (FUN_004a34f0, FUN_0040f9a0, thread FUN_0049d790)

**Precedence:** each receiver input handle is bound to the model of its first 0x03 report (only
once, flag main+0x1007268[i]). If several models are online, message 0x50a (`FUN_004129a0`)
enables a tab for each and selects the **lowest-numbered** connected page (CMS_1 first).
**CONFIRMED**

BLE: `VID&02045E` + `PID&0055` in the device path (strings in ctor.c, `FUN_004a35b0`) → BLE GATT
path (`FUN_0040acd0`), not relevant for Linux/hidraw.

**Exact identification exchange:** nothing has to be sent – read hidraw (interface 2) until an
input report `03 55 xx xx xx` appears (byte1 = 0x55 ⇒ X11). An optional, read-only active check:
`SET_FEATURE a0 0b 08 00 00 00 00 00`, `GET_FEATURE a0` (expect byte1 = 01), `GET_FEATURE 0b`
(8 bytes): byte2 == 0x55 ⇒ CMS_4 (§3.2 step 1). **CONFIRMED** code, response values GUESS.

---------------------------------------------------------------------------------------------------
## 2. Why CMS_4 is the X11 (question 2)

* `res/main.xml` line 303: `option_device_4 text="X11 Mouse"`; tab index 4 = `ver_ms_4`
  (`MS/MS_4/ms_4_page.xml`). X11PRO = CMS_7 (id 0xBE), X11SE = CMS_10 (id 0x07). **CONFIRMED**
* The DPI slider max is 320 → 22000 DPI with the CMS_4 formula (§3.4); X11 is sold as a 22000
  DPI (PAW3311) mouse. Lighting section visible, lift-off and motion sync hidden. **CONFIRMED**
  (xml) / spec match **GUESS**.
* Remaining risk: the user's unit could be an X11SE/X11PRO. The first input report `03 xx ..`
  settles it (0x55 = X11, 0x07 = X11SE, 0xBE = X11PRO).

---------------------------------------------------------------------------------------------------
## 3. Configuration protocol for CMS_4 (question 3)

### 3.1 Transport (CONFIRMED, `FUN_004a1970`, `FUN_004a3f50`)
* Wired: `HidD_SetFeature/GetFeature` on the 0x0B collection of 1d57:fa55; up to 5 tries, 200 ms
  apart. Wireless: `hid_send_feature_report` on the 0x0B collection of the receiver; the packet is
  repeated every 500 ms (max 10×) **until the mouse ACKs** with input report
  `03 55 50 <status> ..` (status 0 = OK; sets page+0x3f8, `FUN_004a1690`).
* Linux equivalent: `HIDIOCSFEATURE(len)` / `HIDIOCGFEATURE(len)` on the hidraw node of
  interface 2, buf[0] = report id; read() on the same node yields the 0x03 input reports.

### 3.2 Reading (`FUN_004a38a0`, triggered by thread msg 0x630 wParam=1)
Read handshake `FUN_004a3f50(id, len, flag)`:
1. `SET_FEATURE 0xA0`: `a0 <id> <len> 00 <flag> 00 00 00` (8 bytes). Sleep 500 ms (wireless) /
   100 ms (wired).
2. `GET_FEATURE 0xA0` (8 bytes); continue only if byte1 == 0x01.
3. `GET_FEATURE <id>` with buffer length `<len>`; check byte0 == id and byte1 == len.

Order used by the app (CONFIRMED):
| step | request | flag | response use |
|---|---|---|---|
| 1 | 0x0b, len 8 | 0 | word = byte2<<8 \| byte3 → page+0x67634. byte2 must be 0x55, otherwise the app uses a legacy path (single GET of report 0x0a, 0x80 bytes). byte3 = firmware/protocol version? **GUESS** |
| 2 | 0x06, len 9 | 1 | polling rate (byte3), §3.5 |
| 3 | 0x05, len 15 | 1 | lighting + power + debounce, §3.6 (`FUN_004996e0`) |
| 4 | 0x04, len 56 | 1 | DPI block, §3.4 (`FUN_004993c0`) |
Buttons (0x08) and macros (0x09) are **never read back**; the app keeps them in its own profile
file. Battery is not read here (it comes from input reports).

### 3.3 Writing (`FUN_004a1d20`, thread msg 0x630 wParam=0)
The app diffs the edited profile against the last-synced copy (`FUN_00485320`) and sends only the
dirty blocks, in this order:
1. (only on full re-sync after a software profile switch, page+0x50cdc==1)
   `0c 0a 01 fe 01 fe 00 00 00 00` – meaning unknown (all 18 models send it, e.g. 0x4a1de8,
   0x422b48 …). **Do not send** (see §5).
2. Report 0x04 DPI block (dirty if stage values/enables/colours/current stage/ripple/angle/
   0x8b0/0x8b4/0x8b8/0x948 changed).
3. Report 0x05 lighting/power block.
4. Report 0x06 polling rate.
5. Report 0x08 button map.
6. Report 0x09 one macro per button whose function is "macro" (0x11) and whose macro changed.
After writing, the app restarts the 6 s watchdog. **CONFIRMED**

Checksum (all multi-byte blocks): `s = sum(buf[3 .. k-1]) & 0xffff; buf[k] = s>>8; buf[k+1] = s&0xff`
where k is given per report. **CONFIRMED**

### 3.4 Report 0x04 – DPI / angle snap / ripple (56 bytes incl. id) – `FUN_004a2050`
| off | value |
|---|---|
| 0 | 0x04 |
| 1 | 0x38 (=56, total length) |
| 2 | 0x01 |
| 3 | angle snap 0/1 (profile+0x944) |
| 4 | ripple control 0/1 (profile+0x940) |
| 5 | stage-enable bitmask, bit i = stage i enabled |
| 6 | "high range" bitmask, bit i set if stage index n_i ≥ 221 |
| 7 | copy of byte 6 (X/Y pair? **GUESS**) |
| 8..15 | per-stage sensor code c_i |
| 16..23 | per-stage flag f_i (0/1) |
| 24 | active stage, 1-based |
| 25..48 | 8 × (R,G,B) stage colours |
| 49 | 0x02 |
| 50,51 | checksum of bytes 3..49, big-endian |
| 52..55 | 0 |

Stage value n (UI slider 1..320): **DPI = 50·n for n ≤ 200, else 100·(n−100)** (0x49e8cc).
Encoding of (c, f, high-bit) from n, T = table at 0x4ec024 (`dpi_table_T.txt`, T[n] ≈ round(50n/42.55)):
| n | c | f | high bit |
|---|---|---|---|
| 1..200 | T[n] | 0 | 0 |
| 201..220 | T[n] (=T[n−100]) | 1 | 0 |
| 221..300 | T[n−100] | 0 | 1 |
| 301..320 | T[200 + ((n−300)>>1)] | 1 | 1 |
(CONFIRMED). Physical meaning: DPI ≈ c·42.55·2^(f+high) (GUESS, fits every row).
Read-back decoder (`FUN_004993c0`) inverts this with table 0x4e50a8 (= T[1..]); note n=301/302
do not round-trip exactly.
Defaults (`FUN_004a4670`, table 0x4ec398): stages 800/1600/2400/3200/5000/22000 enabled,
stages 7–8 disabled, active stage index 1 (1600); colours (bytes R,G,B, confirmed by the UI
SetBkColor in `FUN_0049e7a0`) red, green, blue, yellow, cyan, magenta, orange (ff 40 00), white.
Only 6 stage sliders are visible for X11 (ver_dpi_7/8 hidden).

### 3.5 Report 0x06 – polling rate (9 bytes) – `FUN_004a1d20`
`06 09 01 <rate> <~rate> 00 00 00 00`; rate: 125 Hz = 0x08, 250 = 0x04, 500 = 0x02, 1000 = 0x01.
Read-back: byte3 same code. **CONFIRMED** (X11 UI offers only these 4.)

### 3.6 Report 0x05 – lighting, sleep timers, debounce (15 bytes) – `FUN_004a1d20`, `FUN_004996e0`
| off | value |
|---|---|
| 0,1,2 | 05 0f 01 |
| 3 | mode << 4 (mode 0 Off, 1 Static, 2 Breathing, 3 Neon, 4 Colour breathing, 5 Static DPI, 6 Breathing DPI) |
| 4 | (deep_sleep & 0xF0) \| (9 − speed)  ; speed slider 4..8 → 5..1 |
| 5 | (deep_sleep << 4) \| brightness ; brightness 1..8 sent only for modes 1 and 5, else 8 |
| 6,7,8 | colour R, G, B |
| 9 | sleep time ("Sleep Time", profile+0x930, slider 1..60, label "Min") |
| 10 | key debounce ("Key Response Time", slider 2..25, default 4; unit ms GUESS) |
| 11,12 | checksum of bytes 3..10, big-endian |
| 13,14 | 0 |
deep_sleep = "Deep Sleep Time" slider (profile+0x92c, 1..60, label "Min"), split across the two
high nibbles: `deep_sleep = (b4 & 0xF0) | (b5 >> 4)`. Defaults: mode 0 (off), colour green,
brightness 8, speed 6, sleep 1, deep sleep 10, debounce 4. **CONFIRMED** (units GUESS)

### 3.7 Report 0x08 – button map (59 bytes) – `FUN_004a26c0`
`08 3b 01` + 18 × 3-byte entries (bytes 3..56) + checksum(3..56) at 57,58.
Entry k = profile button k. X11 UI exposes k = 0 (left), 1 (right), 2 (middle), 6 (UI "4",
default Forward), 7 (UI "5", default Backward); k = 5 defaults to DPI cycle (not editable in UI);
3,4,8–15 off; 16/17 = wheel up/down. **CONFIRMED** (defaults table 0x4ec8f0, ms_4_page.xml)
The app requires at least one entry = Left click (`one_click_text`).

Entry bytes from table 0x4ec3b8 (`{app_id, b0, b1, b2}`), app_id from the menu handler `FUN_004a09f0`:
| function | app id | entry b0 b1 b2 |
|---|---|---|
| Off | 0x00 | 01 00 00 |
| Left / Right / Middle | 1/2/3 | 02/03/04 00 00 |
| Forward / Backward | 4/5 | 06 / 05 00 00 |
| DPI cycle / + / − | 6/7/8 | 0d / 0e / 0f 00 00 |
| Double click | 9 | 07 00 00 |
| Fire button | 10 | 08 00 00 |
| Scroll up / down | 11/12 | 09 / 0a 00 00 |
| Tilt left / right | 13/14 | 0b / 0c 00 00 |
| Keyboard shortcut | 0x10 | 11 \<mod\> \<HID key\> (mod bit0 Ctrl, 1 Shift, 2 Alt, 3 Win) |
| Macro | 0x11 | 12 00 \<k+1\> |
| Easy aim | 0x16 | 10 00 03 |
| LED loop (hidden) | 0x17 | 29 00 03 |
| Media player / play-pause / stop / prev / next | 0x40–0x44 | 15 / 18 / 19 / 16 / 17 00 00 |
| Vol+ / Vol− / Mute | 0x45–0x47 | 1b / 1c / 1a 00 00 |
| Browser home / fav / fwd / back / stop / refresh / search | 0x50–0x56 | 25 / (11 03 12 = Ctrl+Shift+O) / 20 / 21 / 22 / 24 / 26 |
| E-mail / Calculator / My computer | 0x57–0x59 | 1e / 1d / 23 |
| Cut/Copy/Paste/Open/Save/Find/Redo | 0x20–0x26 | 11 01 {1b,06,19,12,16,09,1c} |
| Select all / Print | 0x28/0x29 | 11 01 04 / 11 01 13 |
| Close window / Swap windows | 0x2a/0x2b | 11 04 3d / 11 04 2b |
| Show desktop / Run / Lock | 0x2c–0x2e | 11 08 07 / 11 08 15 / 11 08 0f |
| Screen capture | 0x32 | 11 0a 16 (Win+Shift+S) |
(CONFIRMED; the b0 values are the firmware action codes; consumer-usage meaning of 0x15–0x26 is
GUESS.)

### 3.8 Report 0x09 – macro (logical 131 bytes, sent as 3 chunks) – `FUN_004a2430`, `FUN_004a1970`
Logical buffer L: `L[0]=09, L[1]=0x83, L[2]=slot (= button index k+1), L[3]=entry+0x0c,
L[4..6]=entry+0x43c (×3, loop setting?), L[7]=entry+0x40 (min 1; play mode GUESS),
L[8..27]=0, L[28]=number of 2-byte items, L[29..]=items, L[129..130]=checksum(L[3..128]) BE.`
Item per recorded event (event = key code, press flag, u16 delay ms):
* delay ≤ 1270: `[ round(delay/10) | (press ? 0x01 : 0x81), keycode ]`
* delay > 1270: `[ round((delay%200)/10) | flag, keycode ], [ delay/200, 0x03 ]`
  (the OR with 0x01 looks like a firmware quirk; copy it literally). Max ~50 items.
Transmission: 3 feature reports of 64 bytes: `09 <len> <slot> <chunk#> + 60 bytes of L[3+60j ..]`,
len = 0x40 for chunks 0,1 and 0x0c for chunk 2 (wireless; the wired path sends 0x40 for all).
**CONFIRMED** code; semantics of header bytes GUESS.

### 3.9 Not supported / software-only on X11 (CONFIRMED)
* Lift-off distance (profile+0x8b4) and motion sync (+0x948): stored but never written to any
  report; UI hidden.
* Profiles are software-only (profile files, `FUN_004a4970`/`FUN_004a4fc0`); switching a profile
  re-sends everything. No on-device profile slots are used by CMS_4.
* "Reset"/restore button only reloads app defaults (`FUN_004a4670`) and writes them; no device
  factory-reset command exists for CMS_4.
* Mouse attribute button opens `main.cpl`.

---------------------------------------------------------------------------------------------------
## 4. Input report 0x03 (question 4) – `FUN_004a1690` (wireless), `FUN_004a14a0` (wired)
Layout `03 55 <evt> <v0> <v1>`; the app forms w1 = buf[1] | buf[2]<<8, w2 = buf[3] | buf[4]<<8.
| evt (buf[2]) | meaning | handling |
|---|---|---|
| 0x10 | active DPI stage changed, v0 = stage 1..8 | UI + DPI popup |
| 0x20 | polling rate changed, v0 = 1..8 | stored raw (app bug? GUESS: rate code) |
| 0x40 | **battery heartbeat**: v0 = state, v1 = percent 0..100 | wireless: v0==3 → charging, else show v1 %; wired: v0==2 → full (100 %), else charging. Restarts 6 s online watchdog |
| 0x50 | write ACK, v0 == 0 → success | §3.1 |
| 0x60 | v0 = 1..10 stored to page+0x174 (battery level in tenths? GUESS) | |
| 0x70 | lighting mode changed, mode = v0 >> 4 | |
| 0x80 | v0 = 1..5, re-saves profile (on-device key? GUESS) | |
Any 0x03 report with buf[1]==0x55 marks the mouse online; absence for 6 s = offline/asleep. The
mouse must therefore send 0x40 at least every few seconds (GUESS). **CONFIRMED** handlers.

Battery/charging and firmware: battery only via event 0x40; the only version-like value is
report 0x0b byte3 (GUESS).

---------------------------------------------------------------------------------------------------
## 5. Dangerous / do-not-send (question 5)
* No DFU, bootloader or firmware-update path exists in AttackShark.exe or hiddriver (no strings
  such as update/upgrade/dfu/boot/.bin; only the report ids listed above are used). **CONFIRMED**
* Never send: `0c 0a 01 fe 01 fe ...` (unknown, part of full re-sync), any report id the X11 page
  does not use (0x07, 0x0a as a write, 0x10, 0x22, 0x0b as a write, 0xa0 with other layouts),
  and report 0x08 without at least one Left-click entry (would leave the mouse without a
  primary button).
* Always compute checksums; byte1 must equal the total length.
* Safe first steps: passive read of input reports; then the read handshake for 0x0b/0x06/0x05/0x04.

---------------------------------------------------------------------------------------------------
## 6. Shared code across models
* `FUN_00485320` (diff), `FUN_0048f050`, hiddriver DLL, receiver probe/dispatch (`FUN_004130c0`,
  `FUN_004137b0`, `FUN_00413fe0`) are shared by all pages. **CONFIRMED**
* CMS_4 uses the read-back parsers `FUN_004993c0`/`FUN_004996e0` that live in the CMS_3 code
  range → CMS_3 (R1) and CMS_4 share the 0x04/0x05 layouts. **CONFIRMED**
* All 18 pages send the same `0c 0a 01 fe 01 fe` packet and have the same send/ACK structure
  (18 identical sites); exact per-model report layouts for other pages were not checked. GUESS.

---------------------------------------------------------------------------------------------------
## 7. Needs a live (read-only) check
1. First 0x03 input report on hidraw5: byte1 == 0x55? Which events arrive, how often (0x40)?
2. `a0 0b 08 00 00 ...` handshake → report 0x0b contents (byte2 0x55, byte3 version?).
3. GET 0x06 / 0x05 / 0x04 with the handshake; confirm byte1 == length and the checksum rule on
   data coming from the device.
4. Whether the Linux receiver exposes 0x0A and 0x0B on the same hidraw node (the user's
   descriptor says yes) and whether report-id-prefixed HIDIOCGFEATURE lengths match (len incl. id).
5. Then one reversible write (e.g. polling rate) and watch for the `03 55 50 00` ACK and whether
   the setting survives a power cycle (flash persistence).

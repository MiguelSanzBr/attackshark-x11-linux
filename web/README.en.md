# ATTACK SHARK X11 in the browser

[Português](README.md)

Configurator for the **ATTACK SHARK X11** wireless mouse that runs in the browser, over WebHID. It is the web
version of [attackshark-x11-linux](https://github.com/MiguelSanzBr/attackshark-x11-linux): same protocol, ported
from Python to TypeScript, with a React interface.

## Why

The official X11 software only runs on Windows. To use the mouse on Linux I reverse-engineered its USB HID
protocol and wrote the configurator in Python ([attackshark-x11-linux](https://github.com/MiguelSanzBr/attackshark-x11-linux),
every byte is described in its `docs/PROTOCOL.md`). This project takes the same logic to the browser: open the
page in Chrome or Edge, pick the receiver, done. Nothing to install.

## What you can configure

| What | Here |
|---|---|
| DPI stages: up to 8, 50 to 22000 DPI, colour per stage, active stage | ✓ |
| Angle snap and ripple control | ✓ |
| Polling rate 125 / 250 / 500 / 1000 Hz | ✓ |
| Lighting: 7 effects, colour, brightness, speed | ✓ |
| Sleep, deep sleep and button debounce | ✓ |
| Battery level and charging state (through the 2.4 GHz receiver) | ✓ |
| Button remapping | not ported (see limits) |
| Macros | no (the Linux version doesn't have them either) |

## The screen

It follows the desktop app's layout: on the left the X11 drawn as an outline (same coordinates as
`gui/mouse.py`) with the button callouts and the LED lit in the active stage's colour; on the right the DPI,
Desempenho, Iluminação and Energia tabs. Each stage has a switch, a colour chip (clicking makes it active and
opens its colour in the picker with wheel, intensity, hex and presets) and a slider. At the bottom a bar shows
the status, model and firmware, and how many changes are pending. Light and dark themes follow the system, with a
toggle. On a phone the columns stack.

Everything works from the keyboard (Tab, and arrow keys on the tabs) with a visible focus ring, and screen
readers hear the status: reading, writing, written, or the error with what to do next.

The drawing sits inside a "Área de teste" (test area): click there with any mouse and the pressed button lights
up green (left, right, middle and both side buttons) and the wheel shows an up or down arrow, like the desktop
app. It works before connecting, in demo mode and when connected. It comes from the page's click events, not from
WebHID, so it shows what the browser receives, not the remapping stored in the X11. Only inside that area does the
site hold back the context menu, the side buttons' back/forward and page scrolling.

## How it works

### Layers (hexagonal)

```
                 +-----------------------------------------------+
  React (UI) --> |  application: use cases                        |
  driving        |  readConfig, planChanges, confirmPlan,         |
  adapter        |  applyChanges, readBattery, followActiveStage  |
                 |  MouseLink (0xA0 handshake, ACK, allow list)   |
                 |        |                         |             |
                 |        v                         v             |
                 |  domain: model + value objects + reports       |
                 |  (DpiStage, PollingRate, LightEffect,          |
                 |   MouseConfig, ChangePlan, encode/decode)      |
                 |                                                |
                 |  ports: HidChannel, MouseDevice                |
                 +-----------------------^------------------------+
                                         | implement HidChannel
                          WebHidChannel (navigator.hid)   DemoChannel (in memory)
                                         ^
                       main.tsx wires everything (composition root)
```

- **`src/domain/`**: the mouse in the language of whoever configures it (DPI stage, polling rate, light effect,
  `MouseConfig`, `ChangePlan`) and the protocol as pure functions. The value objects (`dpi`, `pollingRate`,
  `checkStages`, `checkLight`) hold the invariants: DPI 50 to 22000 in the app's steps, at most 8 stages with at
  least one enabled, only the 4 polling rates. The encoders call them before building any byte. No React, DOM or
  navigator in here. `buttons` maps `MouseEvent.button` (0 to 4) to the X11 button.
- **`src/application/`**: the use cases the UI calls, and the ports. `HidChannel` is the raw HID channel (feature
  and input reports); `MouseLink` runs the conversation with the mouse on top of it (port of `device.py`).
- **`src/adapters/`**: `webhid/` (the real channel), `demo/` (the simulated mouse) and `ui/` (React; it only calls
  use cases and gets its channel from `main.tsx`).

Why: the protocol is the hard part and the one that must not be wrong, so it is isolated and tested byte by byte
against the Python code, with no browser involved. WebHID becomes a replaceable detail, and demo mode goes
through exactly the same read and write path as the real mouse.

The dependency rule is enforced by ESLint (`no-restricted-imports` per folder in `eslint.config.js`): domain does
not import application, adapters or React; application does not import adapters or React; neither uses
`navigator`, `window` or `document`; the UI does not import `demo/`, `webhid/` or `MouseLink` directly. Break it
and `npm run lint` fails, and CI with it.

### Protocol (summary)

Everything goes through feature reports on the usage page 0x0B collection of the receiver (`1d57:fa60`) or of
the wired mouse (`1d57:fa55`). A read is a handshake: send `a0 <id> <size> 00 <flag> 00 00 00`, wait 500 ms on
the receiver (100 ms on the cable), check that 0xA0 comes back with byte 1 = 1, then fetch the report and check
its id and size. A write is `[id, size, 01, data..., checksum]`, checksum = 16-bit big-endian sum; through the
receiver the packet is resent every 500 ms (up to 10 times) until the mouse answers `03 55 50 00`. The only
reports ever written are 0x04 (DPI), 0x05 (lighting, sleep, debounce) and 0x06 (polling).

### Demo mode

An in-memory simulated mouse (`DemoChannel`, port of `tests/fake_mouse.py`) that answers the handshake and sends
the battery heartbeat and the ACK like the real X11. While it is on, a yellow "Modo demo" banner and a top line
stay on screen and the connection shows as "simulada". On Firefox and Safari, which have no WebHID, it is the
only mode available, and the page says so up front.

### Nothing is written without confirmation

1. On connect the site only **reads**: it identifies the mouse and reads DPI, lighting and polling.
2. Editing changes a draft; the mouse receives nothing.
3. "Revisar alterações" (review) opens a dialog listing what changes (from → to) and which reports will be sent. The form locks.
4. Only the "Gravar no mouse" (write) button turns the plan into a `ConfirmedPlan` (`confirmPlan`).
   `applyChanges` refuses any other plan: the type guards it at compile time and a `WeakSet` at runtime, so not
   even a cast gets through.
5. After writing, everything is read back from the mouse and compared byte by byte with what was sent. A
   mismatch is reported.

## Tests

Vitest + Testing Library for unit and interface tests, Playwright (chromium) for the demo-mode e2e. Every byte
fixture has a comment naming the Python function it mirrors. The git history follows TDD: each unit has a
`Teste: ...` commit (failing) before the implementation commit.

| Guarantee | Test |
|---|---|
| Reading writes nothing to the mouse | `readConfig` › "identifica o mouse e lê DPI, luz e polling sem escrever nada"; `App` › "deixa claro na tela q é simulado e lê a config do mouse" |
| Editing writes nothing; writing only after review and confirmation | `App` › "editar não escreve; só grava depois de revisar e confirmar, e mostra o relido"; e2e › "modo demo: lê a config, muda o DPI, confirma e vê aplicado" |
| An unconfirmed plan is not applied (not even with a cast) | `applyChanges` › "recusa plano q não passou pela confirmação, sem mandar nada" |
| Changing the plan after confirming does not change what is sent | `confirmPlan` › "não confirma plano vazio e a confirmação congela os pacotes" |
| Only reports 0x04/0x05/0x06 with the right size (never `0c 0a 01 fe 01 fe`) | `MouseLink.write` › "nunca manda report fora da lista ou com tamanho errado" |
| Waits for the ACK, resends, reports a rejection status | `MouseLink.write` › "espera o ACK do mouse", "falha quando o mouse recusa ou nunca confirma" |
| 0xA0 handshake and checked answer (id and size) | `MouseLink.read` › "faz o handshake e confere id e tamanho da resposta", "recusa resposta com byte de tamanho errado ou id trocado" |
| Correct checksum, and reports with a bad checksum are refused | `checksum` › "soma 16 bits em big-endian, com estouro"; `report 0x04` › "recusa config sem estágio ligado, ativo inválido, checksum errado e tamanho errado" |
| Same bytes as the Python code | `report 0x04` › "padrão de fábrica sai igual ao Python e faz ida e volta", "edição gera os mesmos bytes do Python"; `report 0x05` › "padrão sai igual ao Python"; `encodeStep` › "faixa 301..320 igual a saída do Python, byte a byte" |
| 22000 DPI encodes as the real X11 returned it (0x81 + flags) | `encodeStep` › "22000 DPI vira o código 0x81 com as duas flags, como lido no X11 de verdade" |
| Bytes we don't understand go back as they came | `report 0x04` › "mexe só nos campos conhecidos e devolve o resto como veio" |
| A read-back that differs from what was sent is reported | `applyChanges` › "avisa quando a releitura não bate com o q foi mandado"; `App` › "avisa quando a releitura não bate com o q foi enviado" |
| Domain invariants | `dpi (valor)`, `pollingRate (valor)`, `checkStages`, `checkLight` in `model.test.ts` |
| No WebHID: warning and demo mode, no horizontal scroll at 375 px | `App` › "avisa q só funciona no Chrome/Edge, mostra o conectar desligado e oferece o modo demo"; e2e › "sem WebHID: avisa e entra no demo, sem rolagem lateral em 375 px" |
| WebHID: VID/PID/usage page 0x0B filter and report id in byte 0 | `WebHidChannel.request` › "filtra pelo VID/PID do receptor e do cabo na usage page 0x0B e abre o device"; `WebHidChannel I/O` › "devolve a feature com o id no byte 0, venha ele ou não do navegador" |
| Test area lights the right button and only holds back menu, back and scroll inside it | `partForButton`, `wheelDirection`; `área de teste` in `TestZone.test.tsx`; e2e in `buttons.spec.ts` (left and right click without context menu, rear side button without going back, wheel without scrolling) |
| Status reaches screen readers, including "Gravando…" while the review is open | `leitor de tela e tradutor` › "um status só, sempre montado e fora da casca q fica inerte na revisão" |
| Dependency rule between layers | `npm run lint` (ESLint `no-restricted-imports` per folder) |

### Coverage

100% thresholds for statements, branches, functions and lines over `src/` (in `vite.config.ts`; CI fails
below that). Last run: 192 tests, 666/666 statements, 338/338 branches, 218/218 functions, 552/552 lines.

Excluded, each with its reason commented in `vite.config.ts`:

- `src/main.tsx`: composition root, it only wires WebHID and demo into `<App/>`; the e2e goes through it.
- `src/application/ports.ts`: only declares the port interfaces, no JavaScript left to measure.
- `src/test/**`: helpers and fakes used by the tests themselves.

### Mutation check (manual)

I broke some protections on purpose, ran the tests and restored the code:

| Mutation | Result |
|---|---|
| `applyChanges` without checking that the plan was confirmed | 1 test failed ("recusa plano q não passou pela confirmação, sem mandar nada") |
| Checksum summing from byte 2 instead of 3 | 10 tests failed (Python fixtures and decode) |
| Decode and read ignoring the report id | 2 tests failed (`MouseLink.read` and `report 0x04`) |
| Writing without the allow list of reports | 1 test failed ("nunca manda report fora da lista ou com tamanho errado") |

I also checked the dependency rule by putting an adapter import and a React import inside `domain/` and
`application/`: ESLint flagged both.

## Known limits

- **Chrome and Edge on desktop only.** Firefox and Safari have no WebHID.
- **Not tested on real hardware.** I did not have the mouse connected to the browser during this port. The
  protocol bytes are the same as the Linux version, which was checked on a real X11 (`PROTOCOL.md` §8), but the
  browser path was not exercised: `WebHidChannel` only runs in tests against a fake `navigator.hid`. Things that
  may differ on real hardware:
  - whether Chrome exposes the usage page 0x0B collection (and 0x0A, where the events come from) of the
    receiver's interface 2;
  - whether `receiveFeatureReport` returns the report id in byte 0 (the channel accepts both, and `MouseLink`
    checks id and size, so a wrong guess becomes an error, not garbage);
  - on Linux Chrome needs access to hidraw, i.e. the udev rule from
    [attackshark-x11-linux](https://github.com/MiguelSanzBr/attackshark-x11-linux) (`udev/70-attackshark-x11.rules`).
- **The test area does not read the mouse.** Chrome blocks WebHID access to the mouse's own button collection, so
  the highlight uses the page's click events: it lights up with any mouse and follows the system's remapping, not
  the X11's.
- **Not ported**: button remapping (report 0x08 cannot be read back from the mouse; the Linux version keeps the
  map in a local file, here it would need another persistence scheme and a large screen, so it was left out),
  JSON backup/restore and the English interface (the UI is Portuguese only).
- **Ambiguities inherited from the Python code and the protocol**, kept as they are instead of guessing:
  - above 20000 DPI two steps can share a code; steps 301 and 302 do not round-trip exactly (302 reads back as
    303). The official app uses a different formula in that range, the Python one is used here;
  - byte 7 of report 0x04 is a copy of byte 6; its meaning is a guess;
  - units: sleep and deep sleep in minutes (from the official app's label), debounce unit not confirmed;
  - battery: through the receiver v0 = 3 means charging. On the cable the official app reads it differently
    (v0 = 2 is full) and neither the Python code nor this port handle that;
  - version "1.12" comes from bytes 2-3 of report 0x0B; that it is the firmware version is a guess;
  - the polling (0x20) and lighting (0x70) events the mouse sends are ignored;
  - brightness is only sent in the static effects (the app sends 8 in the others);
  - other ATTACK SHARK models show a "modelo não testado" warning; only the X11 was verified;
  - the simulated mouse starts with the app defaults (like `fake_mouse.py`), not the exact factory state read on
    the real X11 (there ripple control was on and stages 7-8 had code 0).

## How to run

```bash
npm ci
npm run dev          # http://localhost:5174/attackshark-x11-linux/
npm run lint
npm run typecheck
npm run coverage     # unit tests + coverage (fails below 100%)
npx playwright install chromium
npm run e2e          # build + preview on :4174 + Playwright
npm run build        # outputs dist/
```

With Docker (node build stage, nginx serving `dist/`):

```bash
docker compose up --build    # http://localhost:8088/attackshark-x11-linux/
```

`vite.config.ts` sets `base: '/attackshark-x11-linux/'` for GitHub Pages. The `.github/workflows/pages.yml`
workflow builds and publishes to Pages on every push to `main`, and `.github/workflows/ci.yml` runs lint, types,
tests with coverage, e2e and build.

## License

MIT, see [LICENSE](LICENSE).

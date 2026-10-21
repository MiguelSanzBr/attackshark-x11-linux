# ATTACK SHARK X11 no navegador

[English](README.en.md)

Configurador do mouse sem fio **ATTACK SHARK X11** q roda no navegador, via WebHID. É a versão web do
[attackshark-x11-linux](https://github.com/MiguelSanzBr/attackshark-x11-linux): mesmo protocolo, portado de Python
pra TypeScript, com React na interface.

## Por quê

O software oficial do X11 só roda no Windows. Pra usar o mouse no Linux eu fiz a engenharia reversa do protocolo
USB HID e escrevi o configurador em Python ([attackshark-x11-linux](https://github.com/MiguelSanzBr/attackshark-x11-linux),
com o detalhe de cada byte no `docs/PROTOCOL.md` de lá). Aqui a mesma lógica vai pro navegador: abre a página no
Chrome ou no Edge, escolhe o receptor e pronto, sem instalar nada.

## O q dá pra configurar

| O q | Aqui |
|---|---|
| Estágios de DPI: até 8, 50 a 22000 DPI, cor por estágio, estágio ativo | ✓ |
| Angle snap e ripple control | ✓ |
| Polling rate 125 / 250 / 500 / 1000 Hz | ✓ |
| Luz: 7 efeitos, cor, brilho, velocidade | ✓ |
| Sono, sono profundo e debounce dos botões | ✓ |
| Bateria e se tá carregando (pelo receptor 2.4 GHz) | ✓ |
| Remapear botões | não portado (ver limites) |
| Macros | não (nem a versão Linux tem) |

## A tela

Segue o layout do app de desktop: à esquerda o X11 desenhado (o contorno vem das mesmas coordenadas do
`gui/mouse.py`) com as etiquetas dos botões e o LED aceso na cor do estágio ativo; à direita as abas DPI,
Desempenho, Iluminação e Energia. Cada estágio tem switch, chip com a cor (clicar ativa e abre a cor dele no
seletor com roda, intensidade, hex e cores prontas) e slider. Embaixo fica a barra com o status, modelo e
firmware, e a contagem de alterações pendentes. Tema claro e escuro seguem o sistema, com botão pra trocar.
No celular as colunas empilham.

Dá pra usar tudo no teclado (Tab, e setas nas abas) com o foco sempre visível, e o leitor de tela ouve o status:
lendo, gravando, gravado ou o erro com o q fazer em seguida.

O desenho fica dentro de uma "Área de teste": clicando ali com qualquer mouse, o botão apertado acende em verde
(esquerdo, direito, meio e as duas laterais) e a roda mostra uma seta pra cima ou pra baixo, como no app de
desktop. Funciona antes de conectar, no demo e conectado. Vem dos eventos de clique da página e não do WebHID,
então mostra o q o navegador recebe, não o remapeamento gravado no X11. Só dentro da área o site segura o menu de
contexto, o voltar/avançar das laterais e a rolagem da página.

## Como funciona

### Camadas (hexagonal)

```
                 +-----------------------------------------------+
  React (UI) --> |  application: casos de uso                     |
  driving        |  readConfig, planChanges, confirmPlan,         |
  adapter        |  applyChanges, readBattery, followActiveStage  |
                 |  MouseLink (handshake 0xA0, ACK, lista branca)  |
                 |        |                         |             |
                 |        v                         v             |
                 |  domain: modelo + objetos de valor + reports   |
                 |  (DpiStage, PollingRate, LightEffect,          |
                 |   MouseConfig, ChangePlan, encode/decode)      |
                 |                                                |
                 |  portas: HidChannel, MouseDevice               |
                 +-----------------------^------------------------+
                                         | implementam HidChannel
                          WebHidChannel (navigator.hid)   DemoChannel (em memória)
                                         ^
                       main.tsx liga tudo (raiz de composição)
```

- **`src/domain/`**: o mouse na linguagem de quem configura (estágio de DPI, polling rate, efeito de luz,
  `MouseConfig`, `ChangePlan`) e o protocolo como funções puras. Os objetos de valor (`dpi`, `pollingRate`,
  `checkStages`, `checkLight`) seguram as invariantes: DPI de 50 a 22000 nos passos do app, no máximo 8 estágios
  com pelo menos um ligado, só as 4 taxas de polling. Os encoders chamam eles antes de montar qualquer byte.
  `buttons` traduz o `MouseEvent.button` (0 a 4) no botão do X11. Nada de React, DOM ou navigator aqui.
- **`src/application/`**: os casos de uso q a UI chama e as portas. `HidChannel` é o canal HID cru (feature
  reports e input reports); `MouseLink` faz o diálogo com o mouse em cima dele (porta do `device.py`).
- **`src/adapters/`**: `webhid/` (o canal de verdade), `demo/` (o mouse simulado) e `ui/` (React, só chama casos
  de uso e recebe o canal pronto do `main.tsx`).

Pq assim: o protocolo é a parte q dá trabalho e q não pode errar, então ele fica isolado e testado byte a byte
contra o Python, sem navegador no meio. O WebHID vira um detalhe trocável, e o modo demo usa exatamente o mesmo
caminho de leitura e escrita q o mouse real usa.

A regra de dependência é cobrada pelo ESLint (`no-restricted-imports` por pasta em `eslint.config.js`): domain não
importa application, adapters nem React; application não importa adapters nem React; nenhum dos dois usa
`navigator`, `window` ou `document`; a UI não importa `demo/`, `webhid/` nem o `MouseLink` direto. Quebrou, o
`npm run lint` falha e o CI junto.

### Protocolo (resumo)

Tudo trafega em feature reports na coleção de usage page 0x0B do receptor (`1d57:fa60`) ou do mouse no cabo
(`1d57:fa55`). Leitura é um handshake: manda `a0 <id> <tamanho> 00 <flag> 00 00 00`, espera 500 ms no receptor
(100 ms no cabo), confere se o 0xA0 voltou com byte 1 = 1 e só aí busca o report, conferindo id e tamanho.
Escrita: `[id, tamanho, 01, dados..., checksum]`, checksum = soma de 16 bits big-endian; pelo receptor o pacote
é reenviado a cada 500 ms (até 10 vezes) até o mouse responder `03 55 50 00`. Os únicos reports escritos são
0x04 (DPI), 0x05 (luz, sono, debounce) e 0x06 (polling).

### Modo demo

Um mouse simulado em memória (`DemoChannel`, porta do `tests/fake_mouse.py`) q responde o handshake, manda o
heartbeat de bateria e o ACK como o X11 real. Na tela fica uma faixa amarela "Modo demo" e uma linha no topo
o tempo todo, e a conexão aparece como "simulada". No Firefox e no Safari, q não têm WebHID, é o único modo
disponível, e a página avisa isso logo de cara.

### Nada é gravado sem confirmação

1. Ao conectar o site só **lê**: identifica o mouse e lê DPI, luz e polling.
2. Editar mexe num rascunho, o mouse não recebe nada.
3. "Revisar alterações" abre um diálogo com a lista do q muda (de → para) e quais reports vão ser enviados. O formulário trava.
4. Só o botão "Gravar no mouse" vira o plano em `ConfirmedPlan` (`confirmPlan`). O `applyChanges` recusa
   qualquer outro plano: o tipo segura no compilador e um `WeakSet` segura em runtime, então nem um cast passa.
5. Depois de gravar, relê tudo do mouse e confere byte a byte com o q foi enviado. Se não bater, avisa.

## Testes

Vitest + Testing Library pros testes de unidade e da interface, Playwright (chromium) pro e2e do modo demo.
Cada fixture de bytes tem um comentário dizendo qual função do Python ela espelha. O histórico do git segue TDD:
cada unidade tem um commit `Teste: ...` (q falhava) antes do commit da implementação.

| Garantia | Teste |
|---|---|
| Ler não escreve nada no mouse | `readConfig` › "identifica o mouse e lê DPI, luz e polling sem escrever nada"; `App` › "deixa claro na tela q é simulado e lê a config do mouse" |
| Editar não escreve; só grava depois de revisar e confirmar | `App` › "editar não escreve; só grava depois de revisar e confirmar, e mostra o relido"; e2e › "modo demo: lê a config, muda o DPI, confirma e vê aplicado" |
| Plano sem confirmação não é aplicado (nem com cast) | `applyChanges` › "recusa plano q não passou pela confirmação, sem mandar nada" |
| Mexer no plano depois de confirmar não muda o q vai pro mouse | `confirmPlan` › "não confirma plano vazio e a confirmação congela os pacotes" |
| Só os reports 0x04/0x05/0x06, com o tamanho certo (nunca o `0c 0a 01 fe 01 fe`) | `MouseLink.write` › "nunca manda report fora da lista ou com tamanho errado" |
| Espera o ACK, reenvia, mostra status de recusa | `MouseLink.write` › "espera o ACK do mouse", "falha quando o mouse recusa ou nunca confirma" |
| Handshake 0xA0 e resposta conferida (id e tamanho) | `MouseLink.read` › "faz o handshake e confere id e tamanho da resposta", "recusa resposta com byte de tamanho errado ou id trocado" |
| Checksum certo e report com checksum errado recusado | `checksum` › "soma 16 bits em big-endian, com estouro"; `report 0x04` › "recusa config sem estágio ligado, ativo inválido, checksum errado e tamanho errado" |
| Bytes iguais aos do Python | `report 0x04` › "padrão de fábrica sai igual ao Python e faz ida e volta", "edição gera os mesmos bytes do Python"; `report 0x05` › "padrão sai igual ao Python"; `encodeStep` › "faixa 301..320 igual a saída do Python, byte a byte" |
| 22000 DPI codifica como o X11 real devolveu (0x81 + flags) | `encodeStep` › "22000 DPI vira o código 0x81 com as duas flags, como lido no X11 de verdade" |
| Byte q a gente não entende volta como veio | `report 0x04` › "mexe só nos campos conhecidos e devolve o resto como veio" |
| Releitura diferente do enviado é avisada | `applyChanges` › "avisa quando a releitura não bate com o q foi mandado"; `App` › "avisa quando a releitura não bate com o q foi enviado" |
| Invariantes do domínio | `dpi (valor)`, `pollingRate (valor)`, `checkStages`, `checkLight` em `model.test.ts` |
| Sem WebHID: aviso e modo demo, sem rolagem lateral em 375 px | `App` › "avisa q só funciona no Chrome/Edge, mostra o conectar desligado e oferece o modo demo"; e2e › "sem WebHID: avisa e entra no demo, sem rolagem lateral em 375 px" |
| WebHID: filtro VID/PID/usage page 0x0B e id do report no byte 0 | `WebHidChannel.request` › "filtra pelo VID/PID do receptor e do cabo na usage page 0x0B e abre o device"; `WebHidChannel I/O` › "devolve a feature com o id no byte 0, venha ele ou não do navegador" |
| Área de teste acende o botão certo e só segura menu, voltar e rolagem lá dentro | `partForButton`, `wheelDirection`; `área de teste` em `TestZone.test.tsx`; e2e em `buttons.spec.ts` (clique esquerdo e direito sem menu de contexto, lateral de trás sem voltar a página, roda sem rolar) |
| Status chega no leitor de tela, inclusive o "Gravando…" com a revisão aberta | `leitor de tela e tradutor` › "um status só, sempre montado e fora da casca q fica inerte na revisão" |
| Regra de dependência entre camadas | `npm run lint` (ESLint `no-restricted-imports` por pasta) |

### Cobertura

Thresholds de 100% em statements, branches, functions e lines sobre `src/` (no `vite.config.ts`, o CI falha
abaixo disso). Última execução: 192 testes, 666/666 statements, 338/338 branches, 218/218 functions,
552/552 lines.

Fora da conta, cada um com o motivo comentado no `vite.config.ts`:

- `src/main.tsx`: raiz de composição, só liga WebHID e demo no `<App/>`; quem passa por ela é o e2e.
- `src/application/ports.ts`: só declara as interfaces das portas, não sobra JS pra medir.
- `src/test/**`: helpers e fakes dos próprios testes.

### Checagem de mutação (manual)

Quebrei de propósito algumas proteções, rodei os testes e voltei o código:

| Mutação | Resultado |
|---|---|
| `applyChanges` sem checar se o plano foi confirmado | 1 teste falhou ("recusa plano q não passou pela confirmação, sem mandar nada") |
| Checksum somando a partir do byte 2 em vez do 3 | 10 testes falharam (fixtures do Python e decode) |
| Decode e leitura ignorando o report id | 2 testes falharam (`MouseLink.read` e `report 0x04`) |
| Escrita sem a lista de reports permitidos | 1 teste falhou ("nunca manda report fora da lista ou com tamanho errado") |

Também conferi a regra de dependência colocando um import de adapter e de React dentro de `domain/` e
`application/`: o ESLint acusou os dois.

## Limites conhecidos

- **Só Chrome e Edge no desktop.** Firefox e Safari não têm WebHID.
- **Não testei em hardware real.** Eu não tinha o mouse ligado no navegador durante esse port. Os bytes do
  protocolo são os mesmos da versão Linux, q foi conferida num X11 de verdade (`PROTOCOL.md` §8), mas o caminho
  pelo navegador não foi exercitado: o `WebHidChannel` só roda nos testes com um `navigator.hid` falso. Coisas q
  podem mudar no real:
  - se o Chrome libera a coleção de usage page 0x0B (e a 0x0A, de onde vêm os eventos) da interface 2 do receptor;
  - se o `receiveFeatureReport` devolve o id do report no byte 0 (o canal aceita dos dois jeitos, e o `MouseLink`
    confere id e tamanho, então um palpite errado vira erro e não lixo);
  - no Linux o Chrome precisa de acesso ao hidraw, ou seja, a regra udev do
    [attackshark-x11-linux](https://github.com/MiguelSanzBr/attackshark-x11-linux) (`udev/70-attackshark-x11.rules`).
- **Não portado**: remapeamento de botões (o report 0x08 não é lido de volta pelo mouse, a versão Linux guarda o
  mapa num arquivo local; aqui precisaria de outro esquema de persistência e uma tela grande, ficou de fora),
  backup/restauração em JSON e a interface em inglês (a tela é só em português).
- **Área de teste não lê o mouse.** O Chrome bloqueia no WebHID a coleção de botões do próprio mouse, então o
  destaque usa os eventos de clique da página: acende com qualquer mouse e segue o remapeamento do sistema, não o
  do X11.
- **Ambiguidades q vieram do Python e do protocolo**, mantidas como estão em vez de chutar:
  - acima de 20000 DPI dois passos podem dar o mesmo código; os passos 301 e 302 não fazem ida e volta exata
    (302 volta como 303). O app oficial usa outra conta nessa faixa, aqui vale a do Python;
  - o byte 7 do report 0x04 é uma cópia do byte 6, o significado é palpite;
  - unidades: sono e sono profundo em minutos (pelo rótulo do app oficial), debounce sem unidade confirmada;
  - bateria: pelo receptor v0 = 3 é carregando. No cabo o app oficial lê diferente (v0 = 2 é cheia) e nem o
    Python nem aqui tratam esse caso;
  - a versão "1.12" sai dos bytes 2-3 do report 0x0B; q isso seja a versão do firmware é palpite;
  - os eventos de polling (0x20) e de luz (0x70) q o mouse manda são ignorados;
  - o brilho só vai pro mouse nos efeitos estáticos (o app manda 8 nos outros);
  - outros modelos da ATTACK SHARK aparecem com aviso de "modelo não testado"; só o X11 foi verificado;
  - o mouse simulado começa com os padrões do app (como o `fake_mouse.py`), não com o estado de fábrica exato
    lido no X11 real (lá o ripple control vinha ligado e os estágios 7-8 com código 0).

## Como rodar

```bash
npm ci
npm run dev          # http://localhost:5174/attackshark-x11-linux/
npm run lint
npm run typecheck
npm run coverage     # testes de unidade + cobertura (falha abaixo de 100%)
npx playwright install chromium
npm run e2e          # build + preview em :4174 + Playwright
npm run build        # gera dist/
```

Com Docker (build em node e nginx servindo o `dist/`):

```bash
docker compose up --build    # http://localhost:8088/attackshark-x11-linux/
```

O `vite.config.ts` usa `base: '/attackshark-x11-linux/'` pro GitHub Pages. O workflow `.github/workflows/pages.yml`
faz o build e publica no Pages a cada push na `main`, e o `.github/workflows/ci.yml` roda lint, tipos, testes com
cobertura, e2e e build.

## Licença

MIT, ver [LICENSE](LICENSE).

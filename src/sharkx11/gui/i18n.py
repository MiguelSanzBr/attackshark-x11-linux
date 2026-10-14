"""Interface language: Portuguese source strings are the keys, ``EN`` holds their English text."""
import os

LANGS = {"pt": "Português (Brasil)", "en": "English"}
LANG = "pt"                       # set at startup by the app (settings, else the system language)


def system_lang(env=os.environ):
    """"pt" when the first non-empty of LANGUAGE/LC_ALL/LC_MESSAGES/LANG is Portuguese, else "en"."""
    for var in ("LANGUAGE", "LC_ALL", "LC_MESSAGES", "LANG"):
        value = env.get(var, "").split(":")[0]
        if value:
            return "pt" if value.lower().startswith("pt") else "en"
    return "en"


def _(text):
    return EN.get(text, text) if LANG == "en" else text


EN = {
    "(modelo não testado: só o X11 foi verificado)": "(untested model: only the X11 was verified)",
    "A bateria aparece no topo enquanto o mouse está ligado ao receptor.": "The battery shows at the top while the mouse is connected to the receiver.",
    "Alterações pendentes…": "Changes pending…",
    "Alternar DPI": "DPI cycle",
    "Angle snap (corrige linhas tortas)": "Angle snap (straightens lines)",
    "Arquivo inválido: {}": "Invalid file: {}",
    "Atalho (ex.: ctrl+c, alt+f4, f5):": "Shortcut (e.g. ctrl+c, alt+f4, f5):",
    "Atalho de teclado…": "Keyboard shortcut…",
    "Atalho inválido: use algo como ctrl+c, alt+f4 ou f5.": "Invalid shortcut: use something like ctrl+c, alt+f4 or f5.",
    "Atalho: {}": "Shortcut: {}",
    "Avançar": "Forward",
    "Backup salvo em {}": "Backup saved to {}",
    "Botão direito": "Right button",
    "Botão do meio (roda)": "Middle button (wheel)",
    "Botão esquerdo": "Left button",
    "Botões": "Buttons",
    "Brilho": "Brightness",
    "Calculadora": "Calculator",
    "Clique direito": "Right click",
    "Clique do meio": "Middle click",
    "Clique duplo": "Double click",
    "Clique esquerdo": "Left click",
    "Clique no número para ativar o estágio e editar a cor dele. O botão de DPI do mouse alterna entre os estágios ligados.": "Click a number to make that stage active and edit its colour. The mouse's DPI button cycles through the enabled stages.",
    "Configuração lida do mouse ({}). As mudanças são salvas automaticamente.": "Settings read from the mouse ({}). Changes are saved automatically.",
    "Cor": "Colour",
    "Cor do DPI": "DPI colour",
    "Cor do estágio": "Stage colour",
    "Desativado": "Disabled",
    "Desempenho": "Performance",
    "Desligado": "Off",
    "Dormir após": "Sleep after",
    "Economia de energia": "Power saving",
    "Efeito": "Effect",
    "Energia": "Power",
    "Erro": "Error",
    "Estágios de DPI": "DPI stages",
    "Faixa anterior": "Previous track",
    "Fixo": "Static",
    "Função dos botões": "Button functions",
    "Iluminação": "Lighting",
    "Inclinar à direita": "Tilt right",
    "Inclinar à esquerda": "Tilt left",
    "Lateral da frente (4)": "Front side button (4)",
    "Lateral de trás (5)": "Rear side button (5)",
    "Lendo do mouse…": "Reading from the mouse…",
    "Meu computador": "My computer",
    "Mira fácil": "Easy aim",
    "Mouse desligado, dormindo ou fora de alcance. Mexa nele: ele será lido automaticamente.": "Mouse off, asleep or out of range. Move it: it will be read automatically.",
    "Mudo": "Mute",
    "Navegador: avançar": "Browser: forward",
    "Navegador: busca": "Browser: search",
    "Navegador: início": "Browser: home",
    "Navegador: parar": "Browser: stop",
    "Navegador: recarregar": "Browser: refresh",
    "Navegador: voltar": "Browser: back",
    "O mouse não informa o mapa de botões de volta: o app guarda o último que gravou.": "The mouse cannot report its button map back: the app keeps the last one it wrote.",
    "Parar": "Stop",
    "Pelo menos um botão precisa continuar como clique esquerdo.": "At least one button must stay a left click.",
    "Player de mídia": "Media player",
    "Próxima faixa": "Next track",
    "Recarregar": "Reload",
    "Recentes": "Recent",
    "Respiração": "Breathing",
    "Respiração colorida": "Colour breathing",
    "Respiração do DPI": "DPI breathing",
    "Restaurar": "Restore",
    "Restaurar backup": "Restore backup",
    "Restaurar botões de fábrica": "Restore factory buttons",
    "Ripple control (suaviza tremidas)": "Ripple control (smooths jitter)",
    "Rolar para baixo": "Scroll down",
    "Rolar para cima": "Scroll up",
    "Salvando no mouse…": "Saving to the mouse…",
    "Sensor e cliques": "Sensor and clicks",
    "Sono profundo após": "Deep sleep after",
    "Substituir as configurações do mouse por este backup?": "Replace the mouse's settings with this backup?",
    "Taxa de polling": "Polling rate",
    "Tempo de resposta dos botões": "Button response time",
    "Tiro rápido": "Rapid fire",
    "Tocar/pausar": "Play/pause",
    "Velocidade": "Speed",
    "Voltar": "Back",
    "versão {}": "version {}",
    "receptor 2.4G": "2.4G receiver",
    "cabo USB": "USB cable",
    "✓ Salvo no mouse.": "✓ Saved to the mouse.",
}

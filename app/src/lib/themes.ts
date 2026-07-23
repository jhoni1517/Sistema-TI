// ==== Sistema de temas: modo claro/escuro + cor de destaque ====

export type ModoTema = "auto" | "claro" | "escuro";

export interface Accent {
  nome: string;
  hex: string; // cor 600, usada como referência (gráficos, swatch)
  vars: Record<string, string>; // shades 50..900 como "R G B"
}

// Cada preset traz a escala completa (Tailwind) em RGB para virar variável CSS.
export const ACCENTS: Record<string, Accent> = {
  azul: {
    nome: "Azul",
    hex: "#2563eb",
    vars: {
      "50": "239 246 255", "100": "219 234 254", "200": "191 219 254",
      "300": "147 197 253", "400": "96 165 250", "500": "59 130 246",
      "600": "37 99 235", "700": "29 78 216", "800": "30 64 175", "900": "30 58 138",
    },
  },
  esmeralda: {
    nome: "Esmeralda",
    hex: "#059669",
    vars: {
      "50": "236 253 245", "100": "209 250 229", "200": "167 243 208",
      "300": "110 231 183", "400": "52 211 153", "500": "16 185 129",
      "600": "5 150 105", "700": "4 120 87", "800": "6 95 70", "900": "6 78 59",
    },
  },
  violeta: {
    nome: "Violeta",
    hex: "#7c3aed",
    vars: {
      "50": "245 243 255", "100": "237 233 254", "200": "221 214 254",
      "300": "196 181 253", "400": "167 139 250", "500": "139 92 246",
      "600": "124 58 237", "700": "109 40 217", "800": "91 33 182", "900": "76 29 149",
    },
  },
  laranja: {
    nome: "Laranja",
    hex: "#ea580c",
    vars: {
      "50": "255 247 237", "100": "255 237 213", "200": "254 215 170",
      "300": "253 186 116", "400": "251 146 60", "500": "249 115 22",
      "600": "234 88 12", "700": "194 65 12", "800": "154 52 18", "900": "124 45 18",
    },
  },
  rosa: {
    nome: "Rosa",
    hex: "#e11d48",
    vars: {
      "50": "255 241 242", "100": "255 228 230", "200": "254 205 211",
      "300": "253 164 175", "400": "251 113 133", "500": "244 63 94",
      "600": "225 29 72", "700": "190 18 60", "800": "159 18 57", "900": "136 19 55",
    },
  },
  petroleo: {
    nome: "Petróleo",
    hex: "#0d9488",
    vars: {
      "50": "240 253 250", "100": "204 251 241", "200": "153 246 228",
      "300": "94 234 212", "400": "45 212 191", "500": "20 184 166",
      "600": "13 148 136", "700": "15 118 110", "800": "17 94 89", "900": "19 78 74",
    },
  },
  vermelho: {
    nome: "Vermelho",
    hex: "#dc2626",
    vars: {
      "50": "254 242 242", "100": "254 226 226", "200": "254 202 202",
      "300": "252 165 165", "400": "248 113 113", "500": "239 68 68",
      "600": "220 38 38", "700": "185 28 28", "800": "153 27 27", "900": "127 29 29",
    },
  },
};

export const ACCENT_KEYS = Object.keys(ACCENTS);

/** hex da cor de destaque atual (para os gráficos) */
export const accentHex = (key?: string): string =>
  ACCENTS[key || "azul"]?.hex || ACCENTS.azul.hex;

/** decide se o modo escuro está ativo, considerando "auto" */
export const isDark = (modo: ModoTema): boolean => {
  if (modo === "escuro") return true;
  if (modo === "claro") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
};

/** aplica cor de destaque + modo escuro no documento */
export const aplicarTema = (corDestaque: string, modo: ModoTema): void => {
  const root = document.documentElement;
  const accent = ACCENTS[corDestaque] || ACCENTS.azul;
  Object.entries(accent.vars).forEach(([shade, rgb]) => {
    root.style.setProperty(`--brand-${shade}`, rgb);
  });
  root.classList.toggle("dark", isDark(modo));
};

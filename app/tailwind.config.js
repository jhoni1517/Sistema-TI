/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // A cor de destaque vem de variáveis CSS (trocáveis em tempo real)
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
        },
        // Tokens do balcão — docs/DESIGN.md. Variáveis em index.css.
        papel: "rgb(var(--papel) / <alpha-value>)",
        cartao: "rgb(var(--cartao) / <alpha-value>)",
        concreto: "rgb(var(--concreto) / <alpha-value>)",
        linha: "rgb(var(--linha) / <alpha-value>)",
        tinta: {
          DEFAULT: "rgb(var(--tinta) / <alpha-value>)",
          suave: "rgb(var(--tinta-suave) / <alpha-value>)",
        },
        sinal: {
          DEFAULT: "rgb(var(--sinal) / <alpha-value>)",
          tinta: "rgb(var(--sinal-tinta) / <alpha-value>)",
        },
        etiqueta: "rgb(var(--etiqueta) / <alpha-value>)",
        status: {
          aberta: "rgb(var(--status-aberta) / <alpha-value>)",
          analise: "rgb(var(--status-analise) / <alpha-value>)",
          aprovacao: "rgb(var(--status-aprovacao) / <alpha-value>)",
          aprovada: "rgb(var(--status-aprovada) / <alpha-value>)",
          reparo: "rgb(var(--status-reparo) / <alpha-value>)",
          peca: "rgb(var(--status-peca) / <alpha-value>)",
          pronta: "rgb(var(--status-pronta) / <alpha-value>)",
          entregue: "rgb(var(--status-entregue) / <alpha-value>)",
          cancelada: "rgb(var(--status-cancelada) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        // docs/DESIGN.md. Nomes próprios em vez de trocar `sans`/`mono`:
        // trocar o padrão mudaria todas as telas antigas de uma vez.
        grotesca: ["Bricolage Grotesque", "system-ui", "sans-serif"],
        codigo: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

/**
 * Gera os ícones do app a partir de um SVG só.
 *
 *   npm run icones
 *
 * Por que a chave e não as letras "TI": ícone de app é lido a 40px na aba do
 * navegador e a 108px na tela inicial. Nesse tamanho texto vira mancha, e o
 * que se reconhece de longe é silhueta. A chave é a mesma da tela de OS, para
 * o ícone e o app falarem a mesma língua.
 *
 * Por que âmbar e não azul: azul é a cor mais disputada de qualquer tela
 * inicial (mensageiros, redes, banco). Um quadrado azul arredondado some no
 * meio de outros oito iguais.
 *
 * ---
 *
 * A primeira versão era um quadrado laranja CHAPADO com um risco fino de
 * chave no meio. Na gaveta de aplicativos, ao lado de OLX, PagBank, Shopee e
 * Telegram, ele parecia o rascunho que ninguém terminou — e é ele que aparece
 * gigante na abertura do Android, que é a primeira coisa que o dono da loja vê
 * de manhã.
 *
 * O que separa um ícone acabado de um chapado, nesta ordem:
 *
 * 1. **Traço grosso.** Risco fino some no tamanho em que o ícone é olhado de
 *    verdade. É o item que mais rende.
 * 2. **Profundidade.** Gradiente com três paradas, brilho no canto de cima e
 *    sombra no de baixo: o quadrado deixa de ser papel e vira objeto.
 * 3. **Sombra sob a marca.** Um borrão escuro atrás da chave descola ela do
 *    fundo — sem isso o desenho parece adesivo colado.
 * 4. **Anel interno.** Uma linha clara de meio ponto na borda arremata o
 *    contorno, que é o que o olho lê primeiro na tela inicial.
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publico = resolve(raiz, "public");
mkdirSync(publico, { recursive: true });

/** Três paradas, não duas: com duas o gradiente fica de plástico. */
const FUNDO_1 = "#fcd34d";
const FUNDO_2 = "#f59e0b";
const FUNDO_3 = "#e2530a";
const MARCA = "#1c1917";

/** Chave de boca — mesmo traçado do ícone Wrench usado na interface. */
const CHAVE =
  "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 " +
  "7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z";

/**
 * @param raio    cantos arredondados. Zero para os ícones que o próprio
 *                sistema recorta (Android maskable e iOS), senão arredonda
 *                duas vezes.
 * @param escala  tamanho da chave. Menor no maskable, porque o Android corta
 *                tudo que passa dos 80% centrais.
 * @param traco   espessura do risco da chave, na escala do desenho.
 * @param enfeite brilho, sombra e anel. O maskable dispensa: o recorte do
 *                Android come justamente a borda onde eles moram.
 */
const svg = ({ raio = 112, escala = 8.6, traco = 3.5, enfeite = true } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="${FUNDO_1}"/>
      <stop offset="0.45" stop-color="${FUNDO_2}"/>
      <stop offset="1" stop-color="${FUNDO_3}"/>
    </linearGradient>
    <radialGradient id="brilho" cx="0.3" cy="0.2" r="0.8">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.45"/>
      <stop offset="0.6" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="pe" x1="0" y1="0.55" x2="0" y2="1">
      <stop offset="0" stop-color="#7c2d12" stop-opacity="0"/>
      <stop offset="1" stop-color="#7c2d12" stop-opacity="0.28"/>
    </linearGradient>
    <!-- Região explícita: deixada em porcentagem, o renderizador desenha um
         retângulo mais escuro em volta da chave, que aparece como uma caixa
         no meio do ícone. -->
    <filter id="sombra" filterUnits="userSpaceOnUse"
            x="0" y="0" width="512" height="512">
      <feDropShadow dx="0" dy="9" stdDeviation="10"
                    flood-color="#7c2d12" flood-opacity="0.45"/>
    </filter>
  </defs>

  <rect width="512" height="512" rx="${raio}" fill="url(#g)"/>
${
  enfeite
    ? `  <rect width="512" height="512" rx="${raio}" fill="url(#pe)"/>
  <rect width="512" height="512" rx="${raio}" fill="url(#brilho)"/>`
    : ""
}

  <g transform="translate(256 256) scale(${escala}) translate(-12 -12)"
     fill="none" stroke="${MARCA}" stroke-width="${traco}"
     stroke-linecap="round" stroke-linejoin="round"${enfeite ? ' filter="url(#sombra)"' : ""}>
    <path d="${CHAVE}"/>
  </g>
${
  enfeite
    ? `  <rect x="1.5" y="1.5" width="509" height="509" rx="${raio - 1.5}"
        fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="3"/>`
    : ""
}
</svg>
`;

const arredondado = svg();
const quadrado = svg({ raio: 0 });
// Sem enfeite e com a chave menor: o Android recorta a borda em círculo,
// gota ou quadrado conforme o aparelho, e leva o anel junto.
const maskable = svg({ raio: 0, escala: 6.9, enfeite: false });

writeFileSync(resolve(publico, "icon.svg"), arredondado);
writeFileSync(resolve(publico, "favicon.svg"), arredondado);

const png = (fonte, tamanho, nome) =>
  sharp(Buffer.from(fonte))
    .resize(tamanho, tamanho)
    .png({ compressionLevel: 9 })
    .toFile(resolve(publico, nome));

await Promise.all([
  png(arredondado, 192, "icon-192.png"),
  png(arredondado, 512, "icon-512.png"),
  png(maskable, 512, "icon-maskable-512.png"),
  // O iOS arredonda sozinho e não aceita transparência.
  png(quadrado, 180, "apple-touch-icon.png"),
  png(arredondado, 32, "favicon-32.png"),
]);

console.log("Ícones gerados em public/");

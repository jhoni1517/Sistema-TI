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
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publico = resolve(raiz, "public");
mkdirSync(publico, { recursive: true });

const FUNDO_1 = "#fbbf24";
const FUNDO_2 = "#ea580c";
const MARCA = "#1c1917";

/** Chave de boca — mesmo traçado do ícone Wrench usado na interface. */
const CHAVE =
  "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 " +
  "7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z";

/**
 * @param raio  cantos arredondados. Zero para os ícones que o próprio sistema
 *              recorta (Android maskable e iOS), senão arredonda duas vezes.
 * @param escala tamanho da chave. Menor no maskable, porque o Android corta
 *              tudo que passa dos 80% centrais.
 */
const svg = ({ raio = 112, escala = 9.2 } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${FUNDO_1}"/>
      <stop offset="1" stop-color="${FUNDO_2}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${raio}" fill="url(#g)"/>
  <g transform="translate(256 256) scale(${escala}) translate(-12 -12)"
     fill="none" stroke="${MARCA}" stroke-width="2.9"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="${CHAVE}"/>
  </g>
</svg>
`;

const arredondado = svg();
const quadrado = svg({ raio: 0 });
const maskable = svg({ raio: 0, escala: 7.2 });

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
  // Android recorta em círculo, gota, quadrado... conforme o aparelho.
  png(maskable, 512, "icon-maskable-512.png"),
  // O iOS arredonda sozinho e não aceita transparência.
  png(quadrado, 180, "apple-touch-icon.png"),
  png(arredondado, 32, "favicon-32.png"),
]);

console.log("Ícones gerados em public/");

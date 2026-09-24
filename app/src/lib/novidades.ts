import { temModulo, type Modulo } from "./ramos";

/**
 * O sininho: o que mudou no sistema desde a última vez que a pessoa olhou.
 *
 * Quem aluga o sistema precisa PERCEBER que ele evolui — melhoria que
 * ninguém vê é igual a melhoria que não existe na hora de renovar. A fonte
 * é o NOVIDADES.md (texto que qualquer um edita), lido no build.
 *
 * "Já vi" fica no aparelho: é conveniência de quem está olhando, não dado
 * da loja. Perder (aba anônima, limpeza) só faz o sino acender de novo.
 */

export interface Novidade {
  data: string;
  titulo: string;
  frase: string;
  rota: string;
  modulo?: Modulo;
}

const CABECALHO = /^##\s+(\d{4}-\d{2}-\d{2})\s+·\s+(.+?)\s*$/;

/** O markdown vira lista, a mais nova primeiro. Bloco torto é ignorado. */
export function lerNovidades(md: string): Novidade[] {
  const lista: Novidade[] = [];
  let atual: Partial<Novidade> | null = null;
  const fechar = () => {
    if (atual?.data && atual.titulo && atual.frase && atual.rota) lista.push(atual as Novidade);
    atual = null;
  };
  for (const bruta of md.split(/\r?\n/)) {
    const linha = bruta.trim();
    const cab = linha.match(CABECALHO);
    if (cab) {
      fechar();
      atual = { data: cab[1], titulo: cab[2] };
      continue;
    }
    if (!atual || !linha || bruta.startsWith("    ")) continue;
    const rota = linha.match(/^Rota:\s*(\S+)/i);
    const modulo = linha.match(/^Módulo:\s*(\S+)/i);
    if (rota) atual.rota = rota[1];
    else if (modulo) atual.modulo = modulo[1] as Modulo;
    else if (!atual.frase) atual.frase = linha;
  }
  fechar();
  return lista.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
}

/** As que valem para esta loja: módulo que ela não tem não vira novidade */
export const novidadesDoRamo = (lista: Novidade[], ramo: string | null | undefined): Novidade[] =>
  lista.filter((n) => !n.modulo || temModulo(ramo, n.modulo));

/**
 * Quais a pessoa ainda não viu. `vistoAte` é a data da mais nova que ela
 * já viu. Aparelho que nunca abriu o sino vê só as dos últimos 30 dias:
 * a lista inteira acesa no primeiro dia é barulho, não novidade.
 */
export function naoVistas(lista: Novidade[], vistoAte: string | null, hoje: string): Novidade[] {
  const corte = vistoAte || menosDias(hoje, 30);
  return lista.filter((n) => n.data > corte);
}

/** A data que marca "vi tudo até aqui" */
export const maisNova = (lista: Novidade[]): string => lista.reduce((m, n) => (n.data > m ? n.data : m), "");

function menosDias(dia: string, n: number): string {
  const d = new Date(dia + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export const CHAVE_VISTAS = "sistema-ti:novidades-vistas";

import { estaCifrado } from "./cripto";
import { txt } from "./format";
import type { OrdemServico } from "./types";

/**
 * Em que estado estão os dados de acesso do aparelho nesta OS.
 *
 * ------------------------------------------------------------
 * POR QUE "VAZIO" E "ILEGÍVEL" PRECISAM SER COISAS DIFERENTES
 *
 * A tela dizia "Nenhum dado de acesso registrado" nos dois casos, porque a
 * decifragem devolvia texto vazio quando falhava. Os dois estados são
 * opostos e pedem coisas opostas do atendente:
 *
 * - VAZIO: ninguém anotou a senha. A saída é ligar para o cliente e pedir.
 * - ILEGÍVEL: a senha ESTÁ gravada, o sistema é que não conseguiu abrir
 *   agora. Ligar para o cliente aqui é queimar a loja por um problema que se
 *   resolve entrando de novo no sistema.
 *
 * E tem o lado que não se vê: com os dois estados confundidos, a OS era
 * gravada de novo com o campo vazio e a senha do cliente era apagada do banco
 * em silêncio. Ver `revelar` em lib/cripto.ts e `decifrarLinhas` em lib/db.ts.
 * ------------------------------------------------------------
 */
export type EstadoSigilo = "vazio" | "ilegivel" | "tem";

/** Os campos que sobem cifrados. Os outros nunca ficam ilegíveis. */
const CIFRADOS = ["senhaAparelho", "padraoDesbloqueio"] as const;

type OSSigilo = Pick<
  OrdemServico,
  "senhaAparelho" | "padraoDesbloqueio" | "contaVinculada"
>;

/**
 * Um bloco cifrado que chegou à tela é bloco que NÃO abriu: o caminho normal
 * decifra antes de entregar. Ver `decifrarLinhas` em lib/db.ts.
 */
export const campoIlegivel = (valor: string | null | undefined): boolean =>
  estaCifrado(valor);

export function estadoDoSigilo(os: OSSigilo): EstadoSigilo {
  // Ilegível vem primeiro: uma OS com a senha ilegível E a conta vinculada
  // legível continua sendo uma OS com dado que o atendente não está vendo, e
  // é disso que ele precisa saber.
  if (CIFRADOS.some((c) => campoIlegivel(os[c]))) return "ilegivel";
  const algum = [os.senhaAparelho, os.padraoDesbloqueio, os.contaVinculada].some(
    (v) => !!txt(v).trim()
  );
  return algum ? "tem" : "vazio";
}

/**
 * O recado da tela, já dizendo a saída.
 *
 * "Mensagem de erro precisa dizer qual é a saída" é regra da casa: o texto
 * genérico esconde justamente o caso que a pessoa não tem como adivinhar.
 */
export function recadoDoSigilo(estado: EstadoSigilo): string {
  if (estado === "vazio") return "Nenhum dado de acesso registrado.";
  if (estado === "ilegivel") {
    return (
      "Os dados de acesso estão gravados, mas este aparelho não conseguiu " +
      "abri-los agora. Eles continuam guardados e não foram perdidos. " +
      "Saia e entre de novo no sistema; se continuar assim, avise o suporte."
    );
  }
  return 'Protegido. Clique em "Revelar" para exibir — fica registrado quem viu.';
}

/**
 * Pode gravar por cima dos campos sigilosos desta OS?
 *
 * Não pode enquanto estiverem ilegíveis. Sem esta trava, o técnico abre a OS
 * para corrigir o modelo do aparelho, salva, e leva junto o campo de senha
 * que a tela mostrou vazio — apagando o que estava no banco.
 *
 * A gravação em si continua acontecendo: o que esta função diz é que os
 * campos sigilosos daquela OS têm que ir para o banco COMO VIERAM.
 */
export const podeEditarSigilo = (os: OSSigilo): boolean =>
  estadoDoSigilo(os) !== "ilegivel";

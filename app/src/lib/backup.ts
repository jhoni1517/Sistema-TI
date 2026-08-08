import { txt, normalizar } from "./format";
import { BACKUP_META, type BackupOS, type OrdemServico } from "./types";

/**
 * Backup dos dados do cliente.
 *
 * Formatação e troca de SSD apagam tudo, e apagar não tem desfazer. É o
 * único erro desta loja que nenhum conserto posterior resolve: peça errada
 * se troca, valor errado se acerta, foto de casamento apagada acabou.
 *
 * O combinado vivia solto no meio do texto do defeito — "extremamente
 * lento, não precisa backup" — onde some assim que alguém escreve mais uma
 * linha, e onde ninguém procura na hora de formatar.
 *
 * Duas coisas que a regra precisa garantir:
 *
 * 1. **Não decidir é um estado, e ele incomoda.** "pendente" existe para o
 *    sistema poder cobrar. Se o padrão fosse "não precisa", esquecer de
 *    perguntar viraria autorização por omissão.
 * 2. **A cobrança vem antes de a máquina ser mexida**, não na entrega.
 *    Perguntar sobre backup com o aparelho já formatado não serve para
 *    nada.
 */

/** O que vale para esta OS. OS antiga, sem o campo, é "pendente". */
export const backupDe = (o: Pick<OrdemServico, "backup">): BackupOS =>
  o.backup && BACKUP_META[o.backup] ? o.backup : "pendente";

/**
 * Serviços em que apagar os dados é o caminho normal.
 *
 * Casa por pedaço do texto porque o nome da peça é livre: cada loja escreve
 * "Formatação Computador ou Notebook" do jeito dela.
 */
const APAGA_DADOS = [
  "formata",
  "reinstala",
  "instala windows",
  "instalacao de windows",
  "troca de ssd",
  "troca de hd",
  "upgrade de ssd",
  "ssd",
  "hd ",
  "disco",
  "sistema operacional",
];

/**
 * Esta OS mexe em disco?
 *
 * Serve para o sistema puxar o assunto sozinho, em vez de esperar alguém
 * lembrar. Erra para o lado de perguntar demais: perguntar à toa custa um
 * clique, não perguntar custa os dados do cliente.
 */
export function mexeNosDados(o: OrdemServico): boolean {
  // Sem acento dos dois lados, e por isso a lista acima e escrita sem acento.
  // Quem digita o defeito no balcao escreve "instalacao de windows"; com a
  // comparacao crua o aviso de backup nao aparecia justamente ali, e o
  // conserto que apaga as fotos do cliente passava sem ninguem olhar.
  const alvo = normalizar(
    [
      txt(o.defeitoRelatado),
      txt(o.defeitoConstatado),
      ...(o.pecas || []).map((p) => txt(p.descricao)),
    ].join(" ")
  );
  return APAGA_DADOS.some((t) => alvo.includes(t));
}

/**
 * O aviso que a tela mostra, ou vazio quando não há o que dizer.
 *
 * Não bloqueia nada: quem está no balcão decide. Só não deixa passar sem
 * alguém ter olhado.
 */
export function avisoDeBackup(o: OrdemServico): string {
  const estado = backupDe(o);
  if (estado === "pendente" && mexeNosDados(o)) {
    return (
      "Este serviço apaga os dados do aparelho e o backup ainda não foi " +
      "combinado com o cliente. Pergunte antes de mexer no disco — apagar " +
      "não tem desfazer."
    );
  }
  if (estado === "a_fazer") {
    return "O backup está marcado como A FAZER. Faça antes de formatar ou trocar o disco.";
  }
  return "";
}

/**
 * O que impede de dar a OS como pronta.
 *
 * É aqui que a cobrança acontece, e não na entrega: perguntar sobre backup
 * com o aparelho já formatado não serve para nada. Devolve o texto da
 * pergunta, para a tela confirmar — nunca um bloqueio, porque sistema que
 * não deixa fazer nada é contornado por fora.
 */
export function perguntaAntesDeConcluir(o: OrdemServico): string {
  const estado = backupDe(o);
  if (estado === "a_fazer") {
    return (
      "O backup desta OS está marcado como A FAZER e nunca foi marcado como feito.\n\n" +
      "Se você já fez, marque como Backup feito antes de concluir. Concluir assim mesmo?"
    );
  }
  if (estado === "pendente" && mexeNosDados(o)) {
    return (
      "Este serviço apaga os dados e o backup nunca foi combinado com o cliente.\n\n" +
      "Concluir assim mesmo?"
    );
  }
  return "";
}

/** Como o backup sai no papel que o cliente assina */
export function linhaDoRecibo(o: OrdemServico): string {
  const estado = backupDe(o);
  // Pendente não vai para o papel: imprimir "ainda não perguntei" no
  // documento do cliente não informa nada e ainda expõe a loja.
  if (estado === "pendente") return "";
  if (estado === "nao_precisa") {
    return "O cliente dispensou o backup dos dados e declara ciência de que o serviço pode apagar tudo o que está no aparelho.";
  }
  if (estado === "a_fazer") return "Backup dos dados solicitado pelo cliente.";
  return "Backup dos dados realizado pela loja antes do serviço.";
}

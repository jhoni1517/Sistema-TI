import { describe, it, expect } from "vitest";
import {
  montarBackup,
  cifrar,
  decifrar,
  lerBackup,
  dumpDoBackup,
  previaRestauracao,
  paraApagar,
  nomeDoArquivo,
  rotuloDoArquivo,
  TABELAS_BACKUP,
} from "./backup-diario";
// O robô: a mesma conta, em JavaScript puro, lida do disco.
// @ts-expect-error: arquivo JS da Vercel, sem tipos
import * as robo from "../../api/_backup.js";

const chave = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i * 7 % 256)));
const outra = btoa(String.fromCharCode(...Array.from({ length: 32 }, () => 9)));

const tabelas = {
  clientes: [{ id: "c1", nome: "Ana Maria", telefone: "11999990000", lojaId: "L" }],
  ordens: [{ id: "o1", numero: 1, pecas: [{ descricao: "Tela", precoUnit: 650 }], senhaAparelho: "enc1.abc", lojaId: "L" }],
  precos_fornecedor: [{ id: "p1", valor: 10 }],
  contas_pagar: [{ id: "k1", descricao: "Aluguel", valor: 1500 }],
  rmas: [{ id: "r1", descricao: "Tela A15" }],
};

describe("ida e volta", () => {
  it("backup → cifra → decifra → restaura: dados idênticos", async () => {
    const b = montarBackup("L", "2026-09-26T06:00:00Z", tabelas, { nomeLoja: "Cell X" });
    const pacote = await cifrar(JSON.stringify(b), chave);
    expect(pacote.startsWith("sbk1.")).toBe(true);
    expect(pacote).not.toContain("Ana Maria");
    const volta = lerBackup(await decifrar(pacote, chave), "L");
    expect(volta).toEqual(b);
    const dump = dumpDoBackup(volta);
    expect(dump).toMatchObject({ clientes: tabelas.clientes, ordens: tabelas.ordens, precos: tabelas.precos_fornecedor, contas: tabelas.contas_pagar });
    // Restaurado, a prévia contra o próprio backup não muda nada.
    const p = previaRestauracao(volta, tabelas);
    expect(p.every((x) => x.iguais === x.noBackup && x.voltam === 0 && x.reaparecem === 0 && x.ficam === 0)).toBe(true);
  });

  it("o app abre o que o robô grava, e o robô abre o que o app grava", async () => {
    const texto = JSON.stringify(robo.montarBackup("L", "2026-09-26T06:00:00Z", tabelas, null));
    expect(await decifrar(await robo.cifrar(texto, chave), chave)).toBe(texto);
    expect(await robo.decifrar(await cifrar(texto, chave), chave)).toBe(texto);
    expect(robo.TABELAS_BACKUP).toEqual([...TABELAS_BACKUP]);
    expect(robo.nomeDoArquivo("2026-09-26T14:32:00Z", true)).toBe(nomeDoArquivo("2026-09-26T14:32:00Z", true));
    expect(robo.paraApagar(["2026-08-01.json.enc", "2026-09-01.json.enc"], "2026-09-26")).toEqual(paraApagar(["2026-08-01.json.enc", "2026-09-01.json.enc"], "2026-09-26"));
  });

  it("chave de outra loja não abre; arquivo que não é backup é recusado", async () => {
    const pacote = await cifrar("{}", chave);
    await expect(decifrar(pacote, outra)).rejects.toThrow(/outra loja/);
    await expect(decifrar("oi", chave)).rejects.toThrow(/não é um backup/);
    expect(() => lerBackup(JSON.stringify(montarBackup("X", "", {}, null)), "L")).toThrow(/outra loja/);
    expect(() => lerBackup("{", "L")).toThrow(/corrompido/);
  });

  it("backup grande (milhares de linhas) cifra sem estourar a pilha", async () => {
    const muitos = Array.from({ length: 20000 }, (_, i) => ({ id: `m${i}`, descricao: "Venda", valor: i }));
    const b = montarBackup("L", "x", { movimentos: muitos }, null);
    const volta = lerBackup(await decifrar(await cifrar(JSON.stringify(b), chave), chave), "L");
    expect(volta.tabelas.movimentos).toHaveLength(20000);
  });
});

describe("prévia da restauração", () => {
  it("volta, reaparece e fica — nada é apagado", () => {
    const b = montarBackup("L", "x", { clientes: [{ id: "a", nome: "Ana" }, { id: "b", nome: "Bia" }, { id: "c", nome: "Caio" }] }, null);
    const hoje = { clientes: [{ id: "a", nome: "Ana", lojaId: "L" }, { id: "b", nome: "Beatriz" }, { id: "d", nome: "Davi" }] };
    expect(previaRestauracao(b, hoje)).toEqual([{ tabela: "clientes", noBackup: 3, iguais: 1, voltam: 1, reaparecem: 1, ficam: 1 }]);
  });
});

describe("retenção e nomes", () => {
  it("apaga só o que passou de 30 dias, e só arquivo com data", () => {
    expect(paraApagar(["2026-08-26.json.enc", "2026-08-27.json.enc", "2026-08-01-manual-1010.json.enc", "leia-me.txt"], "2026-09-26")).toEqual([
      "2026-08-26.json.enc",
      "2026-08-01-manual-1010.json.enc",
    ]);
  });
  it("rótulo legível", () => {
    expect(rotuloDoArquivo("2026-09-26.json.enc")).toBe("26/09/2026 (automático)");
    expect(rotuloDoArquivo(nomeDoArquivo("2026-09-26T14:32:00Z", true))).toBe("26/09/2026 14:32 (manual)");
  });
});

-- ============================================================
--  Baixa de estoque atômica: dois aparelhos vendendo ao mesmo tempo
-- ============================================================
--
-- O CLAUDE.md declarava isto como pendente, com todas as letras:
--
--   "Continua faltando resolver dois aparelhos vendendo ao mesmo tempo:
--    isso o banco resolveria com uma sequência."
--
-- O PROBLEMA
--
-- A baixa é ler-modificar-gravar no navegador: a tela lê o saldo, subtrai a
-- quantidade e grava o resultado. Com dois caixas vendendo a MESMA peça ao
-- mesmo tempo, os dois leem 5, os dois gravam 4, e uma das baixas some.
--
-- Não é caso raro numa loja com dois balcões, e o estrago é invisível: o
-- estoque fica maior do que a prateleira, ninguém procura por mercadoria a
-- mais, e a diferença só aparece na contagem — meses depois, sem origem.
--
-- A SOLUÇÃO
--
-- Um UPDATE único no banco, que trava a linha por construção. Não há janela
-- entre ler e gravar porque não se lê: o banco calcula em cima do valor
-- corrente, seja ele qual for.
--
-- ------------------------------------------------------------
-- O QUE ESTA FUNÇÃO NÃO FAZ, E É DECISÃO
--
-- Ela NÃO bloqueia estoque negativo.
--
-- A versão óbvia teria `and quantidade >= p_qtd`, recusando a baixa quando
-- falta. Parece proteção e é o contrário, e esta base já pagou por isso em
-- quatro telas: o cliente ESTÁ com a peça na mão, a venda vai acontecer de
-- qualquer jeito, e bloquear só faz o atendente registrar por fora.
--
-- Negativo é o sistema dizendo que falta lançar uma entrada. Zero é o
-- sistema escondendo que duas peças saíram sem nunca ter entrado — e aí não
-- sobra nada para a contagem achar nem para a conferência acusar.
--
-- Quem conserta é a contagem de inventário, não uma trava no meio da venda.
-- ------------------------------------------------------------
--
-- Repetível: pode rodar de novo sem quebrar nada.

/*
 * Devolve o saldo NOVO, para a tela mostrar o que ficou de verdade.
 *
 * `p_qtd` é numeric e não integer: produto por peso vende 0,352 kg.
 *
 * SECURITY INVOKER (o padrão): a RLS de `produtos` continua valendo, então
 * uma loja não mexe no estoque da outra. Trocar para DEFINER aqui abriria
 * exatamente o buraco que as políticas fecham.
 */
create or replace function mover_estoque(p_produto uuid, p_qtd numeric)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  v_novo numeric;
  v_servico boolean;
begin
  if p_qtd is null or p_qtd = 0 then
    raise exception 'Quantidade inválida para movimentar estoque: %', p_qtd;
  end if;

  -- Serviço não tem estoque. Existe porque o atendente digitava
  -- 99999999999 na quantidade para o item não ficar vermelho, e o valor do
  -- estoque foi para a casa dos trilhões.
  select coalesce(servico, false) into v_servico from produtos where id = p_produto;
  if not found then
    raise exception 'Produto não encontrado ou inacessível (%)', p_produto
      using errcode = 'check_violation';
  end if;
  if v_servico then
    select quantidade into v_novo from produtos where id = p_produto;
    return v_novo;
  end if;

  -- O arredondamento em grama é a mesma regra de lib/estoque.ts: sem ele um
  -- estoque zerado vira 0.00000000000000004 e a tela mostra "tem" onde não
  -- tem.
  update produtos
     set quantidade = round(coalesce(quantidade, 0) + p_qtd, 3)
   where id = p_produto
  returning quantidade into v_novo;

  if v_novo is null then
    raise exception 'Produto não encontrado ou inacessível (%)', p_produto
      using errcode = 'check_violation';
  end if;

  return v_novo;
end $$;

grant execute on function mover_estoque(uuid, numeric) to authenticated;

/* ---------- Confere ---------- */

-- Tem que devolver uma linha, com pronargs = 2.
select proname, pronargs, prosecdef as security_definer
  from pg_proc
 where proname = 'mover_estoque';

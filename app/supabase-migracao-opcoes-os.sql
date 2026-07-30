-- =====================================================================
-- Sistema TI · MAIS DE UM ORÇAMENTO NA MESMA OS
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase. É seguro repetir.
--
-- O problema: o mesmo conserto costuma ter mais de um caminho, e cada
-- caminho pode ter várias peças — "fonte de 500W mais SSD de 1TB" contra
-- "só a fonte de 200W". Tudo ia na mesma lista e o sistema SOMAVA tudo. O
-- cliente recebia um orçamento cobrando as duas fontes de uma vez.
--
-- A regra, igual à do lib/orcamento.ts:
--   - peça com "opcao" vazia entra em qualquer cenário;
--   - peça com "opcao" preenchida pertence àquele orçamento;
--   - ordens."opcaoEscolhida" guarda a decisão, e sem decisão vale a
--     primeira opção, que é a sugestão da loja.
--
-- Duas regras diferentes mostrariam dois valores para o mesmo orçamento — o
-- da tela da loja e o da página pública do cliente.
--
-- A coluna "opcaoEscolhida" é criada aqui e também no
-- supabase-corrigir-colunas.sql. As peças continuam no jsonb ordens.pecas.
-- =====================================================================

alter table ordens add column if not exists "opcaoEscolhida" text;

-- ---------- Consulta pública, agora ciente das opções ----------
-- Além do total certo, devolve os orçamentos para o cliente escolher na
-- própria página de acompanhamento. Continua sem expor custo, senha do
-- aparelho ou qualquer dado de outro cliente.
drop function if exists consultar_os(uuid, integer);
create function consultar_os(p_loja uuid, p_numero integer)
returns table (
  numero integer,
  status text,
  marca text,
  modelo text,
  "primeiroNome" text,
  total numeric,
  opcoes jsonb,
  "atualizadoEm" text
)
language sql stable security definer set search_path = public
as $$
  with alvo as (
    select * from ordens
     where "lojaId" = p_loja and numero = p_numero
     limit 1
  ),
  itens as (
    select coalesce(trim(p.valor ->> 'opcao'), '') as opcao,
           coalesce(p.valor ->> 'descricao', '') as descricao,
           coalesce((p.valor ->> 'precoUnit')::numeric, 0)
           * coalesce((p.valor ->> 'quantidade')::numeric, 0) as valor,
           coalesce((p.valor ->> 'quantidade')::numeric, 0) as quantidade,
           p.pos
      from alvo,
           jsonb_array_elements(coalesce(alvo.pecas, '[]'::jsonb))
             with ordinality as p(valor, pos)
  ),
  -- Base do serviço: mão de obra, desconto e o que entra em qualquer opção.
  base as (
    select coalesce(a."maoDeObra", 0) - coalesce(a.desconto, 0)
           + coalesce((select sum(valor) from itens where opcao = ''), 0) as v
      from alvo a
  ),
  opcoes as (
    select opcao, min(pos) as ordem, sum(valor) as v
      from itens
     where opcao <> ''
     group by opcao
  ),
  -- Sem decisão registrada vale a primeira: é a sugestão da loja, e deixa o
  -- total num número real em vez de menor que qualquer cenário.
  atual as (
    select coalesce(
      (select o.opcao from opcoes o, alvo a
        where o.opcao = trim(coalesce(a."opcaoEscolhida", ''))),
      (select o.opcao from opcoes o order by o.ordem limit 1),
      ''
    ) as opcao
  )
  select
    a.numero,
    a.status,
    a.marca,
    a.modelo,
    split_part(coalesce(c.nome, ''), ' ', 1) as "primeiroNome",
    case
      when a.status in ('pronta', 'aguardando_aprovacao')
      then (select v from base)
           + coalesce((select o.v from opcoes o, atual t where o.opcao = t.opcao), 0)
      else null
    end as total,
    case
      when a.status = 'aguardando_aprovacao'
      then coalesce((
        select jsonb_agg(jsonb_build_object(
                 'nome', o.opcao,
                 'total', (select v from base) + o.v,
                 'escolhida', o.opcao = (select opcao from atual),
                 'itens', (
                   select jsonb_agg(jsonb_build_object(
                            'descricao', i.descricao,
                            'quantidade', i.quantidade,
                            'valor', i.valor
                          ) order by i.pos)
                     from itens i where i.opcao = o.opcao
                 )
               ) order by o.ordem)
          from opcoes o
      ), '[]'::jsonb)
      else '[]'::jsonb
    end as opcoes,
    a."atualizadoEm"
  from alvo a
  left join clientes c on c.id = a."clienteId";
$$;

-- ---------- Resposta do cliente, com a escolha junto ----------
-- Aprovar sem dizer qual orçamento é o mesmo problema de antes, só que por
-- escrito: alguém no balcão teria que adivinhar quais peças comprar.
--
-- A versão de três argumentos sai de cena: com DEFAULT no quarto parâmetro
-- as duas ficariam ambíguas e o Postgres recusaria a chamada.
drop function if exists responder_orcamento(uuid, integer, boolean);
drop function if exists responder_orcamento(uuid, integer, boolean, jsonb);
drop function if exists responder_orcamento(uuid, integer, boolean, text);
create function responder_orcamento(
  p_loja uuid,
  p_numero integer,
  p_aprovar boolean,
  p_escolha text default null
)
returns boolean
language plpgsql volatile security definer set search_path = public
as $$
declare
  afetadas int;
  v_pecas jsonb;
  v_escolha text := nullif(trim(coalesce(p_escolha, '')), '');
  v_valida text;
begin
  select coalesce(o.pecas, '[]'::jsonb) into v_pecas
    from ordens o
   where o."lojaId" = p_loja
     and o.numero = p_numero
     -- trava: só responde enquanto estiver aguardando aprovação
     and o.status = 'aguardando_aprovacao';

  if v_pecas is null then
    return false;
  end if;

  -- Nome que não existe na OS é descartado em vez de gravado. Gravado, ele
  -- faria o sistema cair na primeira opção sem ninguém perceber: o cliente
  -- aprovaria uma coisa e a loja montaria outra.
  if v_escolha is not null then
    select trim(p ->> 'opcao') into v_valida
      from jsonb_array_elements(v_pecas) p
     where trim(coalesce(p ->> 'opcao', '')) = v_escolha
     limit 1;
    if v_valida is null then
      return false;
    end if;
  end if;

  update ordens
     set "opcaoEscolhida" = case
           when p_aprovar and v_escolha is not null then v_escolha
           else "opcaoEscolhida"
         end,
         status = case when p_aprovar then 'aprovada' else 'cancelada' end,
         "aprovadoEm" = case when p_aprovar then now()::text else "aprovadoEm" end,
         "recusadoEm" = case when p_aprovar then "recusadoEm" else now()::text end,
         "atualizadoEm" = now()::text,
         historico = coalesce(historico, '[]'::jsonb) || jsonb_build_object(
           'data', now()::text,
           'status', case when p_aprovar then 'aprovada' else 'cancelada' end,
           'nota', case
                     when p_aprovar and v_escolha is not null
                       then 'Aprovado pelo cliente - ' || v_escolha
                     when p_aprovar then 'Aprovado pelo cliente'
                     else 'Recusado pelo cliente'
                   end
         )
   where "lojaId" = p_loja
     and numero = p_numero
     and status = 'aguardando_aprovacao';

  get diagnostics afetadas = row_count;
  return afetadas > 0;
end $$;

revoke all on function consultar_os(uuid, integer) from public;
revoke all on function responder_orcamento(uuid, integer, boolean, text) from public;
grant execute on function consultar_os(uuid, integer) to anon, authenticated;
grant execute on function responder_orcamento(uuid, integer, boolean, text) to anon, authenticated;

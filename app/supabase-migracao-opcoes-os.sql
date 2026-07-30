-- =====================================================================
-- Sistema TI · ALTERNATIVAS NO ORÇAMENTO DA OS
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase. É seguro repetir.
--
-- O problema: o mesmo conserto costuma ter mais de um caminho — fonte de
-- 500W ou de 200W, tela original ou paralela. As duas peças ficavam na
-- mesma lista e o sistema SOMAVA as duas. O cliente recebia um orçamento
-- cobrando as duas fontes de uma vez.
--
-- A regra, igual à do lib/orcamento.ts: peça com "opcao" preenchida entra
-- num grupo, e SÓ a marcada com "escolhida" conta em dinheiro. Duas regras
-- diferentes mostrariam dois valores para o mesmo orçamento — o da tela da
-- loja e o da página do cliente.
--
-- Nenhuma coluna nova: ordens.pecas já é jsonb e carrega os campos junto.
-- =====================================================================

-- ---------- Consulta pública, agora ciente das alternativas ----------
-- Além do total certo, devolve as alternativas para o cliente escolher na
-- própria página de acompanhamento. Continua sem expor custo, senha do
-- aparelho ou qualquer dado de outro cliente.
drop function if exists consultar_os(uuid, integer);
create or replace function consultar_os(p_loja uuid, p_numero integer)
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
  select
    o.numero,
    o.status,
    o.marca,
    o.modelo,
    split_part(coalesce(c.nome, ''), ' ', 1) as "primeiroNome",
    case
      when o.status in ('pronta', 'aguardando_aprovacao')
      then coalesce(o."maoDeObra", 0) - coalesce(o.desconto, 0) + coalesce((
        select sum(
          coalesce((p ->> 'precoUnit')::numeric, 0)
          * coalesce((p ->> 'quantidade')::numeric, 0)
        )
        from jsonb_array_elements(coalesce(o.pecas, '[]'::jsonb)) p
        -- Peça fixa entra sempre; alternativa só se for a escolhida.
        where coalesce(trim(p ->> 'opcao'), '') = ''
           or coalesce((p ->> 'escolhida')::boolean, false)
      ), 0)
      else null
    end as total,
    case
      when o.status = 'aguardando_aprovacao'
      then coalesce((
        -- O índice é a identidade da alternativa: peça dentro do jsonb não
        -- tem id próprio, e casar por descrição erra quando duas opções se
        -- chamam igual.
        select jsonb_agg(jsonb_build_object(
                 'indice', p.pos - 1,
                 'grupo', trim(p.valor ->> 'opcao'),
                 'descricao', coalesce(p.valor ->> 'descricao', ''),
                 'valor', coalesce((p.valor ->> 'precoUnit')::numeric, 0)
                          * coalesce((p.valor ->> 'quantidade')::numeric, 0),
                 'escolhida', coalesce((p.valor ->> 'escolhida')::boolean, false)
               ) order by p.pos)
          from jsonb_array_elements(coalesce(o.pecas, '[]'::jsonb))
               with ordinality as p(valor, pos)
         where coalesce(trim(p.valor ->> 'opcao'), '') <> ''
      ), '[]'::jsonb)
      else '[]'::jsonb
    end as opcoes,
    o."atualizadoEm"
  from ordens o
  left join clientes c on c.id = o."clienteId"
  where o."lojaId" = p_loja and o.numero = p_numero
  limit 1;
$$;

-- ---------- Resposta do cliente, com a escolha junto ----------
-- Aprovar sem dizer qual alternativa é o mesmo problema de antes, só que por
-- escrito: alguém no balcão teria que adivinhar qual peça comprar.
--
-- p_escolhas é um array de índices (base zero) das alternativas escolhidas.
-- A versão de três argumentos sai de cena: com DEFAULT no quarto parâmetro
-- as duas ficariam ambíguas e o Postgres recusaria a chamada.
drop function if exists responder_orcamento(uuid, integer, boolean);
drop function if exists responder_orcamento(uuid, integer, boolean, jsonb);
create function responder_orcamento(
  p_loja uuid,
  p_numero integer,
  p_aprovar boolean,
  p_escolhas jsonb default '[]'::jsonb
)
returns boolean
language plpgsql volatile security definer set search_path = public
as $$
declare
  afetadas int;
  v_pecas jsonb;
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

  -- Grava a escolha antes de mudar o status. Recusa não mexe nas peças: o
  -- orçamento fica exatamente como foi enviado, para consulta depois.
  if p_aprovar
     and jsonb_typeof(p_escolhas) = 'array'
     and jsonb_array_length(p_escolhas) > 0 then
    select coalesce(jsonb_agg(
             case
               when coalesce(trim(item.valor ->> 'opcao'), '') = ''
                 then item.valor
               else jsonb_set(
                      item.valor,
                      '{escolhida}',
                      to_jsonb(p_escolhas @> to_jsonb((item.pos - 1)::int))
                    )
             end
             order by item.pos
           ), '[]'::jsonb)
      into v_pecas
      from jsonb_array_elements(v_pecas) with ordinality as item(valor, pos);
  end if;

  update ordens
     set pecas = v_pecas,
         status = case when p_aprovar then 'aprovada' else 'cancelada' end,
         "aprovadoEm" = case when p_aprovar then now()::text else "aprovadoEm" end,
         "recusadoEm" = case when p_aprovar then "recusadoEm" else now()::text end,
         "atualizadoEm" = now()::text,
         historico = coalesce(historico, '[]'::jsonb) || jsonb_build_object(
           'data', now()::text,
           'status', case when p_aprovar then 'aprovada' else 'cancelada' end,
           'nota', case when p_aprovar then 'Aprovado pelo cliente'
                        else 'Recusado pelo cliente' end
         )
   where "lojaId" = p_loja
     and numero = p_numero
     and status = 'aguardando_aprovacao';

  get diagnostics afetadas = row_count;
  return afetadas > 0;
end $$;

revoke all on function consultar_os(uuid, integer) from public;
revoke all on function responder_orcamento(uuid, integer, boolean, jsonb) from public;
grant execute on function consultar_os(uuid, integer) to anon, authenticated;
grant execute on function responder_orcamento(uuid, integer, boolean, jsonb) to anon, authenticated;

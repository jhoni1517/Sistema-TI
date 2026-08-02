-- ============================================================
--  Segredo por ordem no link do rastreio público
-- ============================================================
--
-- O PROBLEMA
--
-- O link que a loja manda leva o UUID da loja, porque a consulta pública é
-- por loja e número: `#/rastreio/OS00007?loja=<uuid>`. E o número da OS é
-- sequencial de propósito — é o que o cliente lê no balcão e repete no
-- telefone.
--
-- Juntas, as duas coisas abriam a assistência inteira. Quem recebia um link
-- (todo cliente, e qualquer pessoa para quem ele encaminhasse) trocava o 7
-- por 1, 2, 3 e via primeiro nome, aparelho e valor de cada conserto da
-- loja. Nem era preciso montar URL na mão: a própria página tinha um campo
-- de busca por número.
--
-- Pior que ler era responder: `responder_orcamento` também pedia só loja e
-- número, e aceitava recusa. Dava para percorrer a fila e CANCELAR, um por
-- um, todos os orçamentos aguardando aprovação da loja.
--
-- A SAÍDA
--
-- O código da OS não pode virar senha: ele é curto e sequencial porque
-- precisa ser. Quem faz o papel de senha é um segredo por ordem, sorteado no
-- banco e que só existe dentro do link.
--
-- Sorteado no BANCO, e não na tela: caminho montado no navegador não protege
-- nada, e é a mesma regra que já vale para a pasta das imagens.
--
-- Link já enviado, sem o segredo, para de funcionar. Não há como aceitar os
-- dois e ao mesmo tempo impedir a adivinhação — o link antigo é justamente o
-- que se adivinha. A tela diz isso e manda pedir um link novo.
--
-- Repetível: pode rodar de novo sem quebrar nada.

-- ---------- A coluna ----------
alter table ordens add column if not exists rastreio text;

-- gen_random_uuid() é nativa do Postgres 13+ e é aleatória de verdade.
-- 12 dígitos hexadecimais = 48 bits: inviável de adivinhar por tentativa, e
-- curto o bastante para o link caber no WhatsApp sem quebrar linha.
alter table ordens
  alter column rastreio
  set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

-- Ordens que já existem ganham o segredo agora. Uma por uma: sem isto, elas
-- ficariam para sempre sem link público.
update ordens
   set rastreio = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
 where rastreio is null or trim(rastreio) = '';

-- Busca do par (loja, número, segredo) na consulta pública.
create index if not exists ordens_rastreio_idx on ordens ("lojaId", numero, rastreio);

-- ---------- Consulta pública ----------
-- Mesmos campos de antes: nunca custo, senha do aparelho, telefone ou
-- qualquer dado de outro cliente. O que muda é que agora ela exige o segredo.
--
-- As versões antigas SAEM DE CENA. Deixar a de dois argumentos concedida a
-- `anon` manteria a porta aberta ao lado da fechada, e ninguém repararia,
-- porque a tela nova nem chama.
drop function if exists consultar_os(uuid, integer);
drop function if exists consultar_os(uuid, integer, text);
create function consultar_os(p_loja uuid, p_numero integer, p_token text)
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
     where "lojaId" = p_loja
       and numero = p_numero
       -- A conferência vive AQUI, junto da busca. Conferir depois, no
       -- JavaScript, deixaria a linha sair do banco.
       and rastreio = nullif(trim(coalesce(p_token, '')), '')
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
  left join clientes c on c.id = a."clienteId"
$$;

-- ---------- Resposta ao orçamento ----------
-- A que mais precisava do segredo: sem ele, dava para cancelar a fila
-- inteira da loja de fora.
drop function if exists responder_orcamento(uuid, integer, boolean);
drop function if exists responder_orcamento(uuid, integer, boolean, jsonb);
drop function if exists responder_orcamento(uuid, integer, boolean, text);
drop function if exists responder_orcamento(uuid, integer, boolean, text, text);
create function responder_orcamento(
  p_loja uuid,
  p_numero integer,
  p_aprovar boolean,
  p_escolha text default null,
  p_token text default null
)
returns boolean
language plpgsql volatile security definer set search_path = public
as $$
declare
  afetadas int;
  v_pecas jsonb;
  v_escolha text := nullif(trim(coalesce(p_escolha, '')), '');
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_valida text;
begin
  -- Sem segredo não se responde nada. A conferência vem antes de tudo para
  -- a função nem chegar a olhar a ordem.
  if v_token is null then
    return false;
  end if;

  select coalesce(o.pecas, '[]'::jsonb) into v_pecas
    from ordens o
   where o."lojaId" = p_loja
     and o.numero = p_numero
     and o.rastreio = v_token
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
     and rastreio = v_token
     and status = 'aguardando_aprovacao';

  get diagnostics afetadas = row_count;
  return afetadas > 0;
end $$;

revoke all on function consultar_os(uuid, integer, text) from public;
revoke all on function responder_orcamento(uuid, integer, boolean, text, text) from public;
grant execute on function consultar_os(uuid, integer, text) to anon, authenticated;
grant execute on function responder_orcamento(uuid, integer, boolean, text, text) to anon, authenticated;

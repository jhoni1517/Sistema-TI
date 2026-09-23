-- =====================================================================
-- Sistema TI · RASTREIO NO JEITO DE APP DE ENTREGA
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase, DEPOIS do
-- supabase-migracao-ramo-motores.sql. É seguro repetir.
--
-- O PROBLEMA
--
-- Quem pede comida acompanha "saiu da cozinha, 19:42". Quem deixa o celular
-- na assistência liga para a loja perguntando, e cada ligação é o técnico
-- largando a bancada. A página do cliente mostrava um fluxo fixo de etapas,
-- sem data, sem previsão e sem dizer de que loja era.
--
-- O QUE MUDA NA FUNÇÃO PÚBLICA
--
-- `consultar_os` passa a devolver, além do que já devolvia:
--   - o histórico, só status e data (a `nota` de cada passo é interna);
--   - a previsão de entrega, coluna nova;
--   - nome, logo, cor e telefone DA LOJA, os mesmos que saem na OS impressa.
--
-- Do cliente continua saindo só o primeiro nome. Telefone do cliente,
-- sobrenome, senha, IMEI e custo não passam por aqui.
--
-- A conta do dinheiro (base, opções, itens) é a MESMA das migrações
-- anteriores, copiada sem mexer — `funcao-repetida.test.ts` confere.
-- =====================================================================

-- A previsão de entrega, AAAA-MM-DD. Texto pelo mesmo motivo de toda data
-- deste sistema: fuso já estragou data demais.
alter table ordens add column if not exists "previsaoEntrega" text;

-- ---------- A consulta pública ----------
-- A versão anterior SAI DE CENA em vez de conviver com a nova: deixar a
-- antiga concedida a `anon` manteria uma porta aberta ao lado da fechada.
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
  fotos jsonb,
  videos jsonb,
  "atualizadoEm" text,
  historico jsonb,
  previsao text,
  loja text,
  logo text,
  cor text,
  whatsapp text
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
  -- A loja, para o topo da página e o botão de falar com ela.
  --
  -- Só o que a própria loja já imprime na OS: nome, logo e telefone do
  -- balcão (`telefoneLoja`). NÃO sai `lojas.whatsapp`: aquele é o contato
  -- do dono com quem cobra a mensalidade, e pode ser o celular pessoal.
  marca as (
    select coalesce(nullif(trim(c.dados ->> 'nomeLoja'), ''), l.nome) as nome,
           case
             when (c.dados ->> 'logoUrl') ~* '^https://'
             then c.dados ->> 'logoUrl'
             else null
           end as logo,
           -- A CHAVE da cor ("laranja"), nunca um valor livre: o que sai
           -- daqui vira estilo na página pública.
           case
             when (c.dados ->> 'corDestaque') ~ '^[a-z]{1,20}$'
             then c.dados ->> 'corDestaque'
             else null
           end as cor,
           nullif(regexp_replace(coalesce(c.dados ->> 'telefoneLoja', ''), '\D', '', 'g'), '') as whatsapp
      from alvo a
      join lojas l on l.id = a."lojaId"
      left join configuracoes c on c.id = a."lojaId"::text
  ),
  -- O histórico, remontado campo a campo: status e data, e mais nada.
  --
  -- Cada passo gravado tem também `nota`, que é texto livre de DENTRO da
  -- loja ("cliente chato, cobrar adiantado"). Devolver o objeto como está
  -- publicaria isso. Montando aqui, só sai o que está escrito nesta função.
  historico_publico as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('status', b.valor ->> 'status', 'data', b.valor ->> 'data')
        order by b.pos
      ),
      '[]'::jsonb
    ) as v
      from (
        select x.valor, x.pos
          from alvo a,
               jsonb_array_elements(coalesce(a.historico, '[]'::jsonb))
                 with ordinality as x(valor, pos)
         where jsonb_typeof(x.valor) = 'object'
           and (x.valor ->> 'status') in (
             'aberta', 'em_analise', 'aguardando_aprovacao', 'aprovada',
             'em_reparo', 'aguardando_peca', 'pronta', 'entregue', 'cancelada'
           )
           and (x.valor ->> 'data') ~ '^\d{4}-\d{2}-\d{2}'
         -- Os 40 últimos: OS que foi e voltou vinte vezes não precisa de
         -- página infinita. O teto vem DEPOIS do filtro — junto dele, passo
         -- inválido gastava vaga (o mesmo bug da foto e do vídeo).
         order by x.pos desc
         limit 40
      ) b
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
  ),
  -- As fotos que o cliente vê. O teto de 6 é o mesmo da tela: o limite mora
  -- nos dois lugares porque a tela pode ser contornada e o banco não.
  --
  -- O CORTE VEM DEPOIS DO FILTRO, e isso já foi bug: com `and pos <= 6` na
  -- mesma cláusula, uma entrada inválida no meio da lista GASTAVA uma vaga
  -- do teto. Medido rodando a função de verdade — sete fotos boas com duas
  -- entradas ruins antes delas devolviam quatro. O cliente perdia foto que a
  -- loja publicou de propósito.
  fotos_publicas as (
    select coalesce(jsonb_agg(valor order by pos), '[]'::jsonb) as v
      from (
        select f.valor, f.pos
          from alvo a,
               jsonb_array_elements(coalesce(a."fotosLaudo", '[]'::jsonb))
                 with ordinality as f(valor, pos)
         where jsonb_typeof(f.valor) = 'string'
           -- Só endereço de imagem publicado pelo próprio sistema. Sem isto,
           -- um texto qualquer gravado na lista vira `src` na página do
           -- cliente.
           and (f.valor #>> '{}') ~* '^https?://'
         order by f.pos
         limit 6
      ) boas
  ),
  -- Os vídeos, remontados campo a campo.
  --
  -- Devolver o objeto gravado como está entregaria à página aberta qualquer
  -- campo que um dia entre nessa lista. Montando aqui, só sai o que está
  -- escrito nesta função — e acrescentar campo novo passa a ser uma decisão,
  -- não um descuido.
  videos_publicos as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'url', valor ->> 'url',
          'capa', case
                    when (valor ->> 'capa') ~* '^https?://'
                    then valor ->> 'capa'
                    else null
                  end,
          'duracao', coalesce((valor ->> 'duracao')::numeric, 0)
        ) order by pos
      ),
      '[]'::jsonb
    ) as v
      from (
        select v.valor, v.pos
          from alvo a,
               jsonb_array_elements(coalesce(a."videosLaudo", '[]'::jsonb))
                 with ordinality as v(valor, pos)
         where jsonb_typeof(v.valor) = 'object'
           and (v.valor ->> 'url') ~* '^https?://'
         order by v.pos
         limit 3
      ) bons
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
                 /*
                  * A LISTA TEM QUE FECHAR COM O PREÇO DE CIMA.
                  *
                  * Ela pegava só `i.opcao = o.opcao`, enquanto o total logo
                  * acima soma a `base` — mão de obra, desconto e os itens
                  * que entram em QUALQUER opção. O cliente lia "Opção 1,
                  * R$ 730,00" com uma peça de R$ 480 embaixo, e os R$ 250 da
                  * bateria não apareciam em lugar nenhum.
                  *
                  * Relatado do balcão, na OS00033: "coloquei a bateria nos
                  * dois orçamentos e não apareceu pro cliente". Preço que não
                  * fecha com a lista faz a loja parecer que está inflando o
                  * orçamento — e a página promete, com todas as letras, que
                  * cada opção JÁ É o valor do serviço completo.
                  *
                  * Agora a lista traz tudo que entra na conta, na ordem em
                  * que a loja digitou: mão de obra primeiro, porque é o que a
                  * OS é, e o desconto por último, porque ele é o abate.
                  */
                 'itens', (
                   select jsonb_agg(x.item order by x.ordem)
                     from (
                       select -1 as ordem,
                              jsonb_build_object(
                                'descricao', 'Mão de obra',
                                'quantidade', 1,
                                'valor', coalesce(a."maoDeObra", 0)
                              ) as item
                        where coalesce(a."maoDeObra", 0) > 0
                       union all
                       select i.pos,
                              jsonb_build_object(
                                'descricao', i.descricao,
                                'quantidade', i.quantidade,
                                'valor', i.valor
                              )
                         from itens i
                        where i.opcao = o.opcao or i.opcao = ''
                       union all
                       select 1000000000,
                              jsonb_build_object(
                                'descricao', 'Desconto',
                                'quantidade', 1,
                                'valor', -coalesce(a.desconto, 0)
                              )
                        where coalesce(a.desconto, 0) > 0
                     ) x
                 )
               ) order by o.ordem)
          from opcoes o
      ), '[]'::jsonb)
      else '[]'::jsonb
    end as opcoes,
    -- Em qualquer etapa: a loja pode registrar o problema antes de fechar o
    -- orçamento e depois de consertar. Prender a prova a um status faria ela
    -- sumir da tela justamente quando o cliente for conferir.
    (select v from fotos_publicas) as fotos,
    (select v from videos_publicos) as videos,
    a."atualizadoEm",
    (select v from historico_publico) as historico,
    case
      when a."previsaoEntrega" ~ '^\d{4}-\d{2}-\d{2}$'
      then a."previsaoEntrega"
      else null
    end as previsao,
    (select nome from marca) as loja,
    (select logo from marca) as logo,
    (select cor from marca) as cor,
    (select whatsapp from marca) as whatsapp
  from alvo a
  left join clientes c on c.id = a."clienteId"
$$;

-- `revoke ... from public` antes do grant: recriar a função devolve a
-- permissão padrão de EXECUTE a todo mundo, e sem esta linha a porta ficaria
-- mais aberta depois da migração do que estava antes.
revoke all on function consultar_os(uuid, integer, text) from public;
grant execute on function consultar_os(uuid, integer, text) to anon, authenticated;

-- ---------- Confere ----------
-- Troque pelo id da sua loja, um número de OS e o segredo do link. A linha
-- tem que trazer `historico` só com status e data, e `loja` preenchido.
-- select numero, historico, previsao, loja, whatsapp
--   from consultar_os('SEU-ID-AQUI', 1, 'SEGREDO-DO-LINK');
select proname, pronargs, prosecdef as security_definer
  from pg_proc
 where proname = 'consultar_os';

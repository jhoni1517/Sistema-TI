-- =====================================================================
-- Sistema TI · CATÁLOGO PÚBLICO
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase. É seguro repetir.
--
-- A loja manda foto de produto no WhatsApp uma por uma, o dia inteiro, e o
-- cliente pergunta preço de coisa que está na prateleira. O catálogo é um
-- link só: a pessoa abre, vê o que tem, e chama já dizendo o que quer.
--
-- O QUE SAI E O QUE NÃO SAI. Sai nome, foto, preço de venda e se está
-- disponível. NÃO sai custo, margem, fornecedor nem quantidade exata —
-- concorrente também abre o link, e quantidade exata em vitrine é convite
-- para negociar em cima do seu estoque parado.
--
-- A função é a única porta: as políticas de leitura de "produtos" continuam
-- exigindo login. Sem isso, abrir o catálogo abriria a tabela inteira.
-- =====================================================================

-- Liga/desliga por loja, e o recado que aparece no topo da página.
alter table lojas add column if not exists catalogo_ativo boolean default false;
alter table lojas add column if not exists catalogo_recado text;

comment on column lojas.catalogo_ativo is
  'A loja quer o catálogo público no ar? Desligado por padrão: ninguém publica preço sem escolher publicar.';

-- ---------- As colunas que a vitrine LÊ ----------
--
-- Sem estas três, este arquivo inteiro morria numa loja NOVA.
--
-- A trinca da promoção nascia lá no `supabase-corrigir-colunas.sql`, que é o
-- ÚLTIMO da ordem — e a função aqui embaixo lê as três. Quem seguisse o
-- CONFIGURACAO.md à risca via o passo 13 abortar com "column
-- p.precoPromocional does not exist", uma frase que não diz a ninguém o que
-- fazer, e seguia para o 14 achando que era um aviso.
--
-- O estrago não é o erro na tela: é que a função `catalogo_loja` NÃO É
-- CRIADA. O catálogo público da loja nova simplesmente não existe, e o
-- `grant` logo abaixo também não roda. Só apareceu quando as 25 migrações
-- foram rodadas em ordem num Postgres de verdade.
--
-- Migração pede a coluna de que precisa, e não confia na ordem.
alter table produtos add column if not exists "precoPromocional" numeric;
alter table produtos add column if not exists "promocaoInicio" text;
alter table produtos add column if not exists "promocaoFim" text;

-- ---------- A vitrine ----------
-- Regra de preço IGUAL à do lib/promocao.ts: promoção só vale se for mais
-- barata que o preço cheio e se a data de hoje estiver dentro do prazo.
-- Duas regras diferentes fariam o catálogo anunciar um preço e o caixa
-- cobrar outro — e quem aparece como mentiroso é a loja.
drop function if exists catalogo_loja(uuid);
create function catalogo_loja(p_loja uuid)
returns table (
  loja text,
  logo text,
  whatsapp text,
  recado text,
  itens jsonb
)
language sql stable security definer set search_path = public
as $$
  with alvo as (
    select l.id, l.nome, l.whatsapp, l.catalogo_ativo, l.catalogo_recado,
           c.dados ->> 'logoUrl' as logo,
           coalesce(c.dados ->> 'telefoneLoja', '') as telefone
      from lojas l
      left join configuracoes c on c.id = l.id::text
     where l.id = p_loja
       and coalesce(l.catalogo_ativo, false)
       -- Loja desligada some da internet junto. Vitrine no ar de loja
       -- bloqueada é preço desatualizado circulando sem dono.
       and coalesce(l.ativa, true)
       and not coalesce(l.bloqueada, false)
     limit 1
  ),
  visiveis as (
    select
      p.nome,
      p."imagemUrl" as imagem,
      p.categoria,
      coalesce(p."porPeso", false) as por_peso,
      case
        when coalesce(p."precoPromocional", 0) > 0
         and coalesce(p."precoPromocional", 0) < coalesce(p.preco, 0)
         and (p."promocaoInicio" is null or p."promocaoInicio" = ''
              or p."promocaoInicio" <= to_char(now(), 'YYYY-MM-DD'))
         and (p."promocaoFim" is null or p."promocaoFim" = ''
              or p."promocaoFim" >= to_char(now(), 'YYYY-MM-DD'))
        then p."precoPromocional"
        else p.preco
      end as preco,
      case
        when coalesce(p."precoPromocional", 0) > 0
         and coalesce(p."precoPromocional", 0) < coalesce(p.preco, 0)
         and (p."promocaoInicio" is null or p."promocaoInicio" = ''
              or p."promocaoInicio" <= to_char(now(), 'YYYY-MM-DD'))
         and (p."promocaoFim" is null or p."promocaoFim" = ''
              or p."promocaoFim" >= to_char(now(), 'YYYY-MM-DD'))
        then p.preco
        else null
      end as preco_de,
      -- Disponível, não a quantidade. Quantidade exata em vitrine é convite
      -- para negociar em cima do estoque parado.
      (coalesce(p.servico, false) or coalesce(p.quantidade, 0) > 0) as tem
      from produtos p, alvo a
     where p."lojaId" = a.id
       and coalesce(p.preco, 0) > 0
       -- Vencido não vai para a vitrine em hipótese alguma.
       and (p.validade is null or p.validade = ''
            or p.validade >= to_char(now(), 'YYYY-MM-DD'))
     order by (coalesce(p.servico, false) or coalesce(p.quantidade, 0) > 0) desc, p.nome
     limit 300
  )
  select
    a.nome as loja,
    a.logo,
    coalesce(nullif(a.whatsapp, ''), a.telefone) as whatsapp,
    a.catalogo_recado as recado,
    coalesce((select jsonb_agg(to_jsonb(v)) from visiveis v), '[]'::jsonb) as itens
  from alvo a;
$$;

revoke all on function catalogo_loja(uuid) from public;
grant execute on function catalogo_loja(uuid) to anon, authenticated;

-- ---------- Confere ----------
-- Troque pelo id da sua loja. Sem catalogo_ativo, não volta nada — e é isso
-- mesmo: ninguém publica preço sem escolher publicar.
-- select * from catalogo_loja('SEU-ID-AQUI');
select id, nome, catalogo_ativo from lojas order by nome;

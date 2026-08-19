-- =====================================================================
-- Sistema TI · FOTO DO PROBLEMA NA PÁGINA DO CLIENTE
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase. É seguro repetir.
--
-- O PROBLEMA
--
-- "A placa está queimada, vai sair R$ 480" é uma frase que o cliente tem que
-- acreditar. Ele não abriu o aparelho, não viu nada, e do outro lado do
-- balcão está justamente quem ganha com o conserto. Metade da desconfiança
-- de quem deixa um aparelho na assistência nasce aí, e explicação por texto
-- não resolve — quanto mais detalhada, mais parece justificativa.
--
-- Uma foto de perto da trilha queimada é a mesma frase sem precisar de fé.
--
-- ---------------------------------------------------------------------
-- POR QUE ISTO É UMA MIGRAÇÃO E NÃO UM AJUSTE DE TELA
--
-- "O que a vitrine pública mostra é decidido no banco." A página de
-- acompanhamento abre sem login, e a única porta por onde os dados dela
-- saem é a função `consultar_os`. Acrescentar as fotos na tela sem
-- acrescentar aqui não mostraria foto nenhuma; e, se um dia a página lesse a
-- tabela direto, filtrar campo na tela não esconderia nada de quem abre o
-- painel do navegador.
--
-- ---------------------------------------------------------------------
-- POR QUE SÓ AS FOTOS DO LAUDO, E NUNCA AS DA ENTRADA
--
-- `fotos` são as da entrada: a prova da loja de que o trinco já estava lá
-- quando o aparelho chegou. Elas são tiradas com o aparelho ligado e pegam a
-- tela de bloqueio, o papel de parede, o que estiver aberto. Publicá-las
-- seria pôr o celular do cliente numa página aberta a quem tiver o link.
--
-- `fotosLaudo` é a lista que alguém preencheu no lugar que diz, com todas as
-- letras, que aquilo vai para o cliente. Só ela sai daqui.
--
-- Continua valendo o resto do corte: nunca custo, margem, fornecedor,
-- telefone, senha do aparelho ou dado de outro cliente.
-- =====================================================================

-- ---------- A coluna ----------
alter table ordens
  add column if not exists "fotosLaudo" jsonb default '[]'::jsonb;

-- ---------- A consulta pública, agora com as fotos ----------
-- A versão de três argumentos SAI DE CENA em vez de conviver com a nova:
-- deixar a antiga concedida a `anon` manteria uma porta aberta ao lado da
-- fechada, e ninguém repararia, porque a tela nova nem chama.
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
  ),
  -- As fotos que o cliente vê. O teto de 6 é o mesmo da tela: o limite mora
  -- nos dois lugares porque a tela pode ser contornada e o banco não.
  -- O CORTE VEM DEPOIS DO FILTRO. Com `and pos <= 6` na mesma cláusula, uma
  -- entrada inválida no meio da lista gastava uma vaga do teto, e o cliente
  -- perdia foto que a loja publicou de propósito. Medido rodando a função de
  -- verdade num Postgres: sete fotos boas com duas entradas ruins antes delas
  -- devolviam quatro.
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
    -- Em qualquer etapa: a loja pode fotografar o problema antes de fechar o
    -- orçamento e depois de consertar. Prender a foto a um status faria a
    -- prova sumir da tela justamente quando o cliente for conferir.
    (select v from fotos_publicas) as fotos,
    a."atualizadoEm"
  from alvo a
  left join clientes c on c.id = a."clienteId"
$$;

-- `revoke ... from public` antes do grant: recriar a função devolve a
-- permissão padrão de EXECUTE a todo mundo, e sem esta linha a porta ficaria
-- mais aberta depois da migração do que estava antes.
revoke all on function consultar_os(uuid, integer, text) from public;
grant execute on function consultar_os(uuid, integer, text) to anon, authenticated;

-- ---------- Confere ----------
-- Tem que devolver uma linha, com prosecdef = true.
select proname, pronargs, prosecdef as security_definer
  from pg_proc
 where proname = 'consultar_os';

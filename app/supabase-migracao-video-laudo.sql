-- =====================================================================
-- Sistema TI · VÍDEO DO PROBLEMA NA PÁGINA DO CLIENTE
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase, DEPOIS do
-- supabase-migracao-fotos-laudo.sql. É seguro repetir.
--
-- O PROBLEMA
--
-- A foto resolve placa queimada. Não resolve "faz um barulho estranho quando
-- liga", nem "a tela pisca de vez em quando", nem "só desliga depois de meia
-- hora" — que é metade do que chega no balcão e justamente a parte que não
-- cabe por escrito. Quinze segundos de vídeo encerram a conversa que três
-- parágrafos não encerram, e o cliente aprova o orçamento sem achar que está
-- sendo enrolado.
--
-- ---------------------------------------------------------------------
-- POR QUE UM DEPÓSITO SEPARADO, E NÃO O DE IMAGENS
--
-- O depósito `imagens` tem teto de 5 MB por arquivo. Vídeo de celular passa
-- disso com folga, e subir esse teto lá dentro deixaria passar também o PNG
-- de 50 MB do scanner — que é lido inteiro na carga de produtos e travaria o
-- sistema no 4G do balcão.
--
-- Dois depósitos, dois tetos. A imagem continua apertada, o vídeo tem o
-- espaço de que precisa, e nenhum dos dois afrouxa o outro.
--
-- ---------------------------------------------------------------------
-- O QUE FAZ A PÁGINA DO CLIENTE ABRIR RÁPIDO
--
-- Não é o vídeo ser pequeno: é ele NÃO BAIXAR até alguém tocar no play. A
-- página usa `preload="metadata"` e uma capa em JPEG de poucos KB, gerada de
-- um quadro do próprio vídeo. O arquivo grande só desce quando a pessoa
-- decide assistir.
--
-- A capa mora no depósito de imagens, e não aqui: ela É uma imagem, e assim
-- entra no mesmo teto apertado que vale para todas as outras.
-- =====================================================================

-- ---------- O depósito de vídeos ----------
-- public = true pelo mesmo motivo das imagens: o vídeo aparece na página que
-- o cliente abre sem login. O que NÃO pode é qualquer um escrever, e disso
-- cuidam as políticas abaixo.
--
-- 60 MB por arquivo: trinta segundos de 1080p num celular novo dão uns 45 MB.
-- O limite existe para barrar o vídeo de dez minutos escolhido por engano na
-- galeria, não para brigar com a câmera de quem trabalha aqui.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos', 'videos', true, 62914560,
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 62914560,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------- Quem pode mexer ----------
-- O caminho é sempre "<id da loja>/pasta/arquivo.mp4". A primeira parte tem
-- que ser a loja de quem está logado: caminho montado na tela não protege
-- nada, a trava é aqui. E vale a régua do resto do sistema — assinatura
-- vencida consulta e imprime, mas não grava.

drop policy if exists "videos_ler" on storage.objects;
create policy "videos_ler" on storage.objects
  for select
  using (bucket_id = 'videos');

drop policy if exists "videos_enviar" on storage.objects;
create policy "videos_enviar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = loja_atual()::text
    and loja_pode_gravar()
  );

drop policy if exists "videos_substituir" on storage.objects;
create policy "videos_substituir" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = loja_atual()::text
    and loja_pode_gravar()
  )
  with check (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = loja_atual()::text
  );

drop policy if exists "videos_apagar" on storage.objects;
create policy "videos_apagar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = loja_atual()::text
    and loja_pode_gravar()
  );

-- ---------- A coluna ----------
-- Só os endereços e a capa; o arquivo fica no depósito. `ordens` é lido
-- inteiro em toda carga, e vídeo dentro da linha seria dezenas de MB a cada
-- F5 — o mesmo motivo pelo qual a foto do produto nunca morou no banco.
alter table ordens
  add column if not exists "videosLaudo" jsonb default '[]'::jsonb;

-- ---------- A consulta pública, agora com os vídeos ----------
-- A versão anterior SAI DE CENA em vez de conviver com a nova: deixar a
-- antiga concedida a `anon` manteria uma porta aberta ao lado da fechada, e
-- ninguém repararia, porque a tela nova nem chama.
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
    -- Em qualquer etapa: a loja pode registrar o problema antes de fechar o
    -- orçamento e depois de consertar. Prender a prova a um status faria ela
    -- sumir da tela justamente quando o cliente for conferir.
    (select v from fotos_publicas) as fotos,
    (select v from videos_publicos) as videos,
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
-- A primeira tem que devolver uma linha com public = true e 62914560.
select id, public, file_size_limit from storage.buckets where id = 'videos';

-- A segunda, uma linha com prosecdef = true.
select proname, pronargs, prosecdef as security_definer
  from pg_proc
 where proname = 'consultar_os';

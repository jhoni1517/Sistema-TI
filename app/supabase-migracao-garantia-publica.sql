-- =====================================================================
-- Sistema TI · GARANTIA NA PÁGINA DO CLIENTE (etiqueta com QR)
-- ---------------------------------------------------------------------
-- Rode no SQL Editor do Supabase. É seguro repetir.
--
-- A etiqueta colada no aparelho leva o QR do rastreio. Depois da entrega,
-- a mesma página passa a mostrar a garantia: até quando vale, o que foi
-- feito e o botão de acionar no WhatsApp da loja.
--
-- Função separada de consultar_os de propósito: aquela carrega a conta do
-- orçamento (copiada e conferida por teste), e mexer nela por causa de
-- três campos arriscaria o preço que o cliente vê.
--
-- Mesma porta do rastreio: loja + número + segredo do link. E só com a OS
-- ENTREGUE. Sai o que o cliente já sabe (o defeito que ELE relatou) e o
-- nome das peças trocadas — sem preço, sem custo, sem nota interna, sem o
-- laudo do técnico.
-- =====================================================================

create or replace function garantia_da_os(p_loja uuid, p_numero integer, p_token text)
returns table ("entregueEm" text, "garantiaDias" integer, relatado text, feito jsonb)
language sql stable security definer set search_path = public
as $$
  with alvo as (
    select * from ordens
     where "lojaId" = p_loja
       and numero = p_numero
       and rastreio = nullif(trim(coalesce(p_token, '')), '')
       and status = 'entregue'
     limit 1
  )
  select
    a."entregueEm",
    coalesce(a."garantiaDias", 0)::integer,
    left(a."defeitoRelatado", 200),
    coalesce((
      select jsonb_agg(left(p.valor ->> 'descricao', 80) order by p.pos)
        from jsonb_array_elements(coalesce(a.pecas, '[]'::jsonb)) with ordinality as p(valor, pos)
       where jsonb_typeof(p.valor) = 'object'
         and coalesce(p.valor ->> 'descricao', '') <> ''
         -- Só o que foi feito: peça de outro orçamento, que o cliente não
         -- escolheu, não entra na lista.
         and (coalesce(trim(p.valor ->> 'opcao'), '') = ''
              or trim(p.valor ->> 'opcao') = trim(coalesce(a."opcaoEscolhida", '')))
    ), '[]'::jsonb)
  from alvo a;
$$;

revoke all on function garantia_da_os(uuid, integer, text) from public;
grant execute on function garantia_da_os(uuid, integer, text) to anon, authenticated;

select 'ok' as resultado;

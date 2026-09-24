-- =====================================================================
-- Sistema TI · SEMINOVOS (ficha pública do aparelho usado)
-- ---------------------------------------------------------------------
-- Rode no SQL Editor do Supabase. É seguro repetir.
--
-- O aparelho usado que a loja comprou entra no estoque com a ficha
-- (checklist, bateria, fotos, garantia) na coluna produtos.seminovo. O
-- cliente que vai comprar abre a ficha pelo link ou QR — sem login.
--
-- Mesma regra do catálogo: quem decide o que sai é esta função, a única
-- porta. Sai nome, preço (com a MESMA regra de promoção do catálogo),
-- checklist, bateria, fotos, garantia e o WhatsApp do balcão. Nunca custo,
-- nunca quantidade, nunca o IMEI inteiro (só o final, para conferir).
-- A porta é loja + segredo do link: número de produto não serve de senha.
-- =====================================================================

alter table produtos add column if not exists seminovo jsonb;

create or replace function ficha_seminovo(p_loja uuid, p_token text)
returns table (
  nome text,
  preco numeric,
  "precoDe" numeric,
  disponivel boolean,
  ok jsonb,
  bateria numeric,
  "imeiFinal" text,
  fotos jsonb,
  "garantiaDias" integer,
  "avaliadoEm" text,
  loja text,
  logo text,
  whatsapp text
)
language sql stable security definer set search_path = public
as $$
  select
    p.nome,
    case
      when coalesce(p."precoPromocional", 0) > 0
       and coalesce(p."precoPromocional", 0) < coalesce(p.preco, 0)
       and (p."promocaoInicio" is null or p."promocaoInicio" = ''
            or p."promocaoInicio" <= to_char(now(), 'YYYY-MM-DD'))
       and (p."promocaoFim" is null or p."promocaoFim" = ''
            or p."promocaoFim" >= to_char(now(), 'YYYY-MM-DD'))
      then p."precoPromocional"
      else p.preco
    end,
    case
      when coalesce(p."precoPromocional", 0) > 0
       and coalesce(p."precoPromocional", 0) < coalesce(p.preco, 0)
       and (p."promocaoInicio" is null or p."promocaoInicio" = ''
            or p."promocaoInicio" <= to_char(now(), 'YYYY-MM-DD'))
       and (p."promocaoFim" is null or p."promocaoFim" = ''
            or p."promocaoFim" >= to_char(now(), 'YYYY-MM-DD'))
      then p.preco
      else null
    end,
    coalesce(p.quantidade, 0) > 0,
    case when jsonb_typeof(p.seminovo -> 'ok') = 'object' then p.seminovo -> 'ok' else '{}'::jsonb end,
    case when (p.seminovo ->> 'bateria') ~ '^[0-9]{1,3}' then (p.seminovo ->> 'bateria')::numeric else null end,
    nullif(right(regexp_replace(coalesce(p.seminovo ->> 'imei', ''), '\D', '', 'g'), 4), ''),
    coalesce((
      select jsonb_agg(f.valor order by f.pos)
        from jsonb_array_elements(coalesce(p.seminovo -> 'fotos', '[]'::jsonb)) with ordinality as f(valor, pos)
       where jsonb_typeof(f.valor) = 'string'
         and (f.valor #>> '{}') ~* '^https://'
    ), '[]'::jsonb),
    case when (p.seminovo ->> 'garantiaDias') ~ '^[0-9]{1,4}' then (p.seminovo ->> 'garantiaDias')::integer else 0 end,
    left(p.seminovo ->> 'avaliadoEm', 10),
    coalesce(nullif(trim(c.dados ->> 'nomeLoja'), ''), l.nome),
    case when (c.dados ->> 'logoUrl') ~* '^https://' then c.dados ->> 'logoUrl' else null end,
    nullif(regexp_replace(coalesce(c.dados ->> 'telefoneLoja', ''), '\D', '', 'g'), '')
  from produtos p
  join lojas l on l.id = p."lojaId"
  left join configuracoes c on c.id = p."lojaId"::text
  where p."lojaId" = p_loja
    and p.seminovo ->> 'ficha' = nullif(trim(coalesce(p_token, '')), '')
    and length(trim(coalesce(p_token, ''))) >= 16
    and coalesce(l.ativa, true)
  limit 1;
$$;

revoke all on function ficha_seminovo(uuid, text) from public;
grant execute on function ficha_seminovo(uuid, text) to anon, authenticated;

select 'ok' as resultado;

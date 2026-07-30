-- =====================================================================
-- Sistema TI · RAMO CONTRATADO
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase. É seguro repetir.
--
-- O ramo saiu da configuração da loja e passou a ser o QUE FOI VENDIDO.
-- Antes ele morava no JSON de configurações, que a própria loja edita: quem
-- contratou mercearia podia se virar pizzaria sozinho e usar o que não
-- pagou. Agora quem define é o administrador do sistema, no ato da venda.
--
-- A trava é no banco, não na tela. Mexer no navegador não adianta.
-- =====================================================================

-- ---------- Ramo contratado pela loja ----------
-- Nulo = assistência técnica, que é como o sistema nasceu. Nenhuma loja
-- existente pode acordar num sistema diferente do de ontem.
alter table lojas add column if not exists ramo text
  check (ramo is null or ramo in ('assistencia', 'mercearia', 'pizzaria', 'bebidas'));

comment on column lojas.ramo is
  'Ramo CONTRATADO. Só o administrador do sistema altera — é o que a loja pagou.';

-- ---------- A loja não muda o próprio ramo ----------
-- Privilégio por coluna não serve aqui: o administrador também entra como
-- "authenticated" e seria bloqueado junto. O gatilho distingue os dois.
create or replace function protege_ramo_loja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ramo is distinct from old.ramo and not sou_super_admin() then
    raise exception
      'O tipo de sistema é definido na contratação. Fale com o suporte para mudar de plano.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protege_ramo_loja on lojas;
create trigger trg_protege_ramo_loja
  before update on lojas
  for each row
  execute function protege_ramo_loja();

-- ---------- Migra o que já estava na configuração ----------
-- Quem já tinha escolhido um ramo em Configurações continua com ele: a
-- mudança não pode tirar da loja o que ela já estava usando.
update lojas l
   set ramo = c.dados ->> 'ramo'
  from configuracoes c
 where c.id = l.id
   and l.ramo is null
   and c.dados ->> 'ramo' in ('assistencia', 'mercearia', 'pizzaria', 'bebidas');

-- ---------- Confere ----------
select l.nome, l.ramo, l.isento
  from lojas l
 order by l.nome;

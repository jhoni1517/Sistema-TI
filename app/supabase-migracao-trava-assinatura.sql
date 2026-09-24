-- =====================================================================
-- Sistema TI · TRAVA DA ASSINATURA (conserto de segurança)
-- ---------------------------------------------------------------------
-- Rode no SQL Editor do Supabase. É seguro repetir.
--
-- A política "minha_loja_editar" deixa o DONO alterar a linha da própria
-- loja — é o que liga o catálogo e a área do cliente. Mas nada segurava
-- as colunas da assinatura: pelo painel do navegador, qualquer dono
-- conseguia mudar o próprio vencimento para 2099, tirar o bloqueio ou se
-- marcar como isento. Conferido num Postgres de teste antes do conserto.
--
-- O plano e o ramo já tinham trava própria; este gatilho faz o mesmo para
-- o resto. Quem passa:
--   - o administrador do sistema;
--   - funções do banco (security definer) e o servidor (chave de serviço):
--     nelas o usuário do banco não é "authenticated", e são elas que
--     registram pagamento e liberam teste, cada uma com a sua conferência.
-- =====================================================================

create or replace function protege_assinatura_loja()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- SEM security definer, de propósito: current_user precisa ser quem
  -- chamou. Dentro de uma função security definer ele é o dono da função.
  if current_user not in ('authenticated', 'anon') or sou_super_admin() then
    return new;
  end if;
  if new."venceEm" is distinct from old."venceEm"
     or new."testeAte" is distinct from old."testeAte"
     or new."ultimoPagamento" is distinct from old."ultimoPagamento"
     or new.bloqueada is distinct from old.bloqueada
     or new.isento is distinct from old.isento
     or new.ativa is distinct from old.ativa
     or new.valor_mensal is distinct from old.valor_mensal
     or new."testesDados" is distinct from old."testesDados"
     or new."motivoTeste" is distinct from old."motivoTeste" then
    raise exception
      'A assinatura só muda pelo suporte. Fale com quem te vendeu o sistema.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protege_assinatura_loja on lojas;
create trigger trg_protege_assinatura_loja
  before update on lojas
  for each row
  execute function protege_assinatura_loja();

select 'ok' as resultado;

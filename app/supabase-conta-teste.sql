-- =====================================================================
-- Sistema TI · CONTA DE TESTE PARA UM RAMO
-- ---------------------------------------------------------------------
-- Cria uma loja separada, com o ramo que você quiser, e liga uma conta do
-- Auth a ela. Serve para conferir como o sistema fica para quem comprou
-- mercearia, pizzaria ou adega — sem encostar na loja de verdade.
--
-- ANTES DE RODAR, crie o usuário no painel:
--   Authentication -> Users -> Add user -> Create new user
--   Marque "Auto Confirm User". Sem SMTP configurado, o e-mail de
--   confirmação não chega e a conta nasce sem poder entrar.
--
-- DEPOIS troque as duas linhas marcadas com TROQUE aqui embaixo.
--
-- Por que não dá para usar "Criar conta" na tela de login: lá a conta entra
-- na loja de quem convidou. O teste ficaria dentro da loja real, vendo e
-- gravando os dados dela.
-- =====================================================================

-- ---------- 1. A loja de teste ----------
-- isento = true: assinatura nunca trava a gravação, é loja de teste.
-- O ramo vai no insert porque o gatilho que protege o ramo só olha update.
insert into lojas (nome, plano, ativa, ramo, isento)
select
  'Mercearia Teste',   -- TROQUE se quiser outro nome
  'essencial',
  true,
  'mercearia',         -- TROQUE: assistencia | mercearia | pizzaria | bebidas
  true
 where not exists (select 1 from lojas where nome = 'Mercearia Teste');

-- ---------- 2. Liga a conta do Auth à loja de teste ----------
-- super_admin = false de propósito: administrador enxerga todos os ramos, e
-- aí o teste não prova nada. A graça é ver o sistema como o cliente vê.
insert into perfis (id, loja_id, nome, papel, ativo, super_admin)
select u.id, l.id, 'Teste', 'dono', true, false
  from auth.users u, lojas l
 where u.email = 'teste.mercearia@exemplo.com'  -- TROQUE pelo e-mail criado
   and l.nome = 'Mercearia Teste'
on conflict (id) do update
   set loja_id = excluded.loja_id,
       papel = 'dono',
       ativo = true,
       super_admin = false;

-- ---------- 3. Confere ----------
-- Sem linha nenhuma aqui, o e-mail do passo 2 não bate com o do painel.
select u.email, p.papel, p.super_admin, l.nome as loja, l.ramo, l.isento
  from perfis p
  join auth.users u on u.id = p.id
  join lojas l on l.id = p.loja_id
 where l.nome = 'Mercearia Teste';

-- =====================================================================
-- PARA APAGAR O TESTE DEPOIS
-- ---------------------------------------------------------------------
-- Apagar a loja leva junto os perfis dela (on delete cascade). O usuário do
-- Auth some no painel, em Authentication -> Users.
--
--   delete from lojas where nome = 'Mercearia Teste';
-- =====================================================================

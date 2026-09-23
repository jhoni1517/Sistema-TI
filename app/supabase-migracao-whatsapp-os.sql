-- =====================================================================
-- Sistema TI · AVISO DE STATUS DA OS PELO WHATSAPP (Cloud API da Meta)
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase, DEPOIS do
-- supabase-migracao-ia.sql. É seguro repetir.
--
-- O PROBLEMA
--
-- O aviso de "tá pronto" depende de alguém lembrar de apertar o botão do
-- WhatsApp e mandar. No dia cheio ninguém lembra, e o cliente liga para
-- perguntar. No plano completo, a loja cadastra o número dela na Meta e o
-- sistema manda sozinho — uma vez por status, nunca duas.
-- =====================================================================

-- ---------- A credencial de cada loja ----------
-- O token da Meta manda mensagem em nome da loja. Chega aqui CIFRADO
-- (mesma chave do Pix, PIX_CHAVE_CRIPTO) e a tabela não tem política
-- nenhuma: o navegador não lê nem grava. Quem grava é api/whatsapp-os.js,
-- depois de conferir que quem pediu é o dono e que o plano é o completo.
create table if not exists whatsapp_credencial (
  "lojaId" uuid primary key references lojas (id) on delete cascade,
  phone_id text not null,
  token_cifrado text not null,
  -- O número que aparece para o cliente, para a tela mostrar sem o token.
  conta text,
  "atualizadoEm" timestamptz not null default now()
);

alter table whatsapp_credencial enable row level security;
drop policy if exists "whatsapp_credencial_ler" on whatsapp_credencial;

-- ---------- A fila de envios ----------
-- O id é OS + status: é ele que garante "nunca duas vezes o mesmo status".
-- Mudar a OS para pronta, voltar para em reparo e pôr pronta de novo não
-- manda o segundo "tá pronto" — o banco recusa a linha repetida.
create table if not exists whatsapp_envios (
  id text primary key,
  "lojaId" uuid not null references lojas (id) on delete cascade,
  "osId" text not null,
  status text not null,
  modelo text not null,
  telefone text not null,
  parametros jsonb not null default '[]'::jsonb,
  -- pendente -> enviado, ou falhou (tenta de novo) -> desistiu
  situacao text not null default 'pendente',
  tentativas integer not null default 0,
  erro text,
  "mensagemId" text,
  "criadoEm" timestamptz not null default now(),
  "enviadoEm" timestamptz
);

create index if not exists whatsapp_envios_fila_idx
  on whatsapp_envios ("lojaId", situacao);

alter table whatsapp_envios enable row level security;

-- A loja LÊ os próprios envios (a OS mostra "avisado no WhatsApp"), mas
-- não grava: envio marcado como feito pelo navegador seria aviso que o
-- cliente nunca recebeu.
drop policy if exists "whatsapp_envios_ler" on whatsapp_envios;
create policy "whatsapp_envios_ler" on whatsapp_envios
  for select to authenticated
  using ("lojaId" = loja_atual());

-- ---------- Confere ----------
select tablename, rowsecurity
  from pg_tables
 where tablename in ('whatsapp_credencial', 'whatsapp_envios');

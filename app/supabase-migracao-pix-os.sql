-- =====================================================================
-- Sistema TI · PIX DA OS PELO LINK DO CLIENTE (Mercado Pago)
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase, DEPOIS do
-- supabase-migracao-rastreio-delivery.sql. É seguro repetir.
--
-- O PROBLEMA
--
-- O cliente aprovava o orçamento pelo link e depois tinha que mandar
-- comprovante de Pix no WhatsApp para alguém conferir no banco e lançar no
-- caixa à mão. Comprovante é print — dá para editar — e o lançamento à mão
-- é onde o valor some ou entra duas vezes.
--
-- Agora o link gera o QR do valor exato, o Mercado Pago avisa quando pagou,
-- e o próprio servidor lança no caixa como Pix. Quem mexe no dinheiro é a
-- função api/pix.js, com a chave de serviço; o navegador não grava nada.
-- =====================================================================

-- ---------- A credencial de cada loja ----------
-- O Access Token do Mercado Pago abre a conta da loja: com ele dá para
-- consultar extrato e devolver pagamento. Por isso:
--
--   1. ele chega aqui CIFRADO (AES-256-GCM, chave PIX_CHAVE_CRIPTO na
--      Vercel). Um vazamento do banco sozinho não entrega o token;
--   2. a tabela não tem política NENHUMA: o navegador não lê nem grava,
--      nem com o login do dono. Quem grava é api/pix.js, depois de
--      conferir que quem pediu é o dono da loja.
--
-- E ele não mora em `configuracoes`: aquilo entra no backup e no arquivo
-- de exportação, que circula por WhatsApp.
create table if not exists pix_credencial (
  "lojaId" uuid primary key references lojas (id) on delete cascade,
  token_cifrado text not null,
  -- Só para a tela dizer "conectado à conta X" sem nunca mostrar o token.
  conta text,
  "atualizadoEm" timestamptz not null default now()
);

alter table pix_credencial enable row level security;
drop policy if exists "pix_credencial_ler" on pix_credencial;
drop policy if exists "pix_credencial_gravar" on pix_credencial;

-- ---------- As cobranças geradas ----------
-- Uma linha por QR gerado. O id é o do pagamento no Mercado Pago: é ele que
-- volta no aviso, e usar o mesmo número aqui evita uma tabela de
-- tradução entre os dois.
create table if not exists pix_cobrancas (
  id text primary key,
  "lojaId" uuid not null references lojas (id) on delete cascade,
  "osId" text not null,
  valor numeric not null,
  status text not null default 'pending',
  "copiaECola" text,
  "qrBase64" text,
  "expiraEm" timestamptz,
  "criadoEm" timestamptz not null default now(),
  "pagoEm" timestamptz,
  -- O lançamento que este pagamento gerou no caixa. Preenchido DEPOIS do
  -- lançamento: dinheiro primeiro, anotação depois.
  "movimentoId" text
);

create index if not exists pix_cobrancas_os_idx on pix_cobrancas ("lojaId", "osId");

alter table pix_cobrancas enable row level security;

-- A loja LÊ as próprias cobranças (para conferir), mas não grava: quem
-- grava é o servidor. Uma cobrança marcada como paga pelo navegador seria
-- dinheiro inventado.
drop policy if exists "pix_cobrancas_ler" on pix_cobrancas;
create policy "pix_cobrancas_ler" on pix_cobrancas
  for select to authenticated
  using ("lojaId" = loja_atual());

-- ---------- Confere ----------
-- Tem que listar as duas tabelas com rowsecurity = true.
select tablename, rowsecurity
  from pg_tables
 where tablename in ('pix_credencial', 'pix_cobrancas');

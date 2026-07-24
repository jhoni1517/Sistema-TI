-- ============================================================
-- Sistema TI · Estrutura do banco de dados (Supabase / Postgres)
-- Rode este script no SQL Editor do seu projeto Supabase.
-- Depois cole a URL e a chave "anon" na tela de Configurações do app.
-- ============================================================

create table if not exists clientes (
  id text primary key,
  nome text not null,
  telefone text,
  cpf text,
  email text,
  endereco text,
  observacoes text,
  "criadoEm" text
);

create table if not exists produtos (
  id text primary key,
  nome text not null,
  categoria text,
  sku text,
  quantidade numeric default 0,
  "estoqueMinimo" numeric default 0,
  custo numeric default 0,
  preco numeric default 0,
  fornecedor text,
  "criadoEm" text
);

create table if not exists ordens (
  id text primary key,
  numero integer,
  "clienteId" text,
  "tipoAparelho" text,
  marca text,
  modelo text,
  cor text,
  "imeiSerial" text,
  "senhaAparelho" text,
  "padraoDesbloqueio" text,
  "contaVinculada" text,
  acessorios text,
  "defeitoRelatado" text,
  "defeitoConstatado" text,
  checklist jsonb default '{}'::jsonb,
  pecas jsonb default '[]'::jsonb,
  "maoDeObra" numeric default 0,
  desconto numeric default 0,
  status text,
  tecnico text,
  "garantiaDias" integer default 90,
  historico jsonb default '[]'::jsonb,
  observacoes text,
  "criadoEm" text,
  "atualizadoEm" text,
  "entregueEm" text
);

create table if not exists movimentos (
  id text primary key,
  tipo text,
  categoria text,
  descricao text,
  valor numeric default 0,
  "formaPagamento" text,
  "osId" text,
  "custoRelacionado" numeric default 0,
  data text,
  "sessaoId" text
);

create table if not exists sessoes (
  id text primary key,
  "abertoEm" text,
  "fechadoEm" text,
  "valorAbertura" numeric default 0,
  "valorFechamento" numeric default 0,
  observacoes text
);

create table if not exists fiados (
  id text primary key,
  "clienteId" text,
  descricao text,
  "osId" text,
  valor numeric default 0,
  pagamentos jsonb default '[]'::jsonb,
  quitado boolean default false,
  vencimento text,
  "criadoEm" text
);

create table if not exists categorias (
  id text primary key,
  nome text not null,
  "paiId" text,
  "criadoEm" text
);

-- ------------------------------------------------------------
-- Segurança (RLS)
-- Como o app usa um login único próprio (não o Auth do Supabase),
-- liberamos acesso pela chave anon. Para uso multiusuário real,
-- ative o Supabase Auth e restrinja as policies por usuário.
-- ------------------------------------------------------------
alter table clientes  enable row level security;
alter table produtos  enable row level security;
alter table ordens    enable row level security;
alter table movimentos enable row level security;
alter table sessoes   enable row level security;
alter table fiados    enable row level security;
alter table categorias enable row level security;

do $$
declare t text;
begin
  foreach t in array array['clientes','produtos','ordens','movimentos','sessoes','fiados','categorias']
  loop
    execute format('drop policy if exists "acesso_total" on %I;', t);
    execute format('create policy "acesso_total" on %I for all using (true) with check (true);', t);
  end loop;
end $$;

#!/bin/bash
# ============================================================
#  Um Postgres de mentira para conferir o que só o banco sabe
# ============================================================
#
# Os testes de lib/ rodam sem banco, e é assim que tem que ser: teste que
# precisa de serviço é teste que ninguém roda. Mas três coisas do sistema
# NÃO dá para conferir sem um Postgres de verdade, e as três já esconderam
# bug:
#
#   1. as 25 migrações rodam em ordem, num banco novo?
#   2. a conta que existe em SQL dá o mesmo número que a de TypeScript?
#   3. duas vendas ao mesmo tempo baixam as duas?
#
# A terceira achou `mover_estoque` pedindo uuid onde a coluna é text — a
# correção de concorrência inteira nunca tinha valido, e nenhum teste sem
# banco pegaria isso.
#
# COMO USAR
#
#   bash scripts/banco-de-teste.sh
#   export PARIDADE_PG="postgresql://$USER@/postgres?host=/var/tmp&port=5610"
#   npm test
#
# Sem a variável, os testes que precisam do banco se PULAM sozinhos. Teste
# que quebra por falta de ferramenta ensina a ignorar teste quebrado.
#
# Precisa do Postgres instalado (`apt install postgresql-16`). Não encosta
# no Supabase de produção: é um banco descartável em /var/tmp.

set -e
PORTA=${PORTA:-5610}
DADOS=${DADOS:-/var/tmp/pg-sistema-ti}
AQUI="$(cd "$(dirname "$0")/.." && pwd)"
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
export PATH="$BIN:$PATH"

command -v initdb >/dev/null || { echo "Postgres não encontrado."; exit 1; }

pg_ctl -D "$DADOS/data" stop >/dev/null 2>&1 || true
rm -rf "$DADOS"; mkdir -p "$DADOS"
initdb -D "$DADOS/data" -U postgres >/dev/null
pg_ctl -D "$DADOS/data" -o "-k /var/tmp -p $PORTA -c listen_addresses=" -l "$DADOS/log" start >/dev/null
sleep 2

# O pedaço do Supabase que as migrações encostam. NÃO é o Supabase: é o
# suficiente para o SQL rodar e revelar erro de ordem, de coluna que não
# existe e de policy apontando para o lugar errado.
psql -h /var/tmp -p "$PORTA" -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create schema if not exists storage;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(), email text,
  raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as
  $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create or replace function auth.role() returns text language sql stable as
  $f$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $f$;
create or replace function auth.email() returns text language sql stable as
  $f$ select nullif(current_setting('request.jwt.claim.email', true), '') $f$;
create table if not exists storage.buckets (
  id text primary key, name text, owner uuid, owner_id text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  public boolean default false, avif_autodetection boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now(),
  updated_at timestamptz default now(), last_accessed_at timestamptz default now(),
  metadata jsonb);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $f$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $f$;
create or replace function storage.filename(name text) returns text language sql immutable as
  $f$ select (string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)] $f$;
grant usage on schema auth, storage to anon, authenticated, service_role;
grant all on all tables in schema auth, storage to anon, authenticated, service_role;
SQL

# As migrações, na ordem que o CONFIGURACAO.md publica.
ORDEM=$(grep -oE '^[0-9]+\. `supabase-[a-z0-9-]+\.sql`' "$AQUI/CONFIGURACAO.md" | grep -oE 'supabase-[a-z0-9-]+\.sql')
n=0
for f in $ORDEM; do
  n=$((n+1))
  if ! psql -h /var/tmp -p "$PORTA" -U postgres -q -v ON_ERROR_STOP=1 -f "$AQUI/$f" >/dev/null 2>"$DADOS/erro.txt"; then
    echo "FALHOU no passo $n ($f):"
    grep ERROR "$DADOS/erro.txt" | head -3
    exit 1
  fi
done

# O que a plataforma do Supabase concede sozinha. Função NÃO entra: o padrão
# do Postgres já é EXECUTE para todos, e cada função tem que se defender.
psql -h /var/tmp -p "$PORTA" -U postgres -q -c "
  grant usage on schema public to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select on all tables in schema public to anon;
"
psql -h /var/tmp -p "$PORTA" -U postgres -q -c \
  "do \$\$ begin if not exists (select 1 from pg_roles where rolname = '$USER')
    then execute format('create role %I login superuser', '$USER'); end if; end \$\$;" 2>/dev/null || true

echo "$n migrações rodaram. Banco no ar na porta $PORTA."
echo
echo "  export PARIDADE_PG=\"postgresql://$USER@/postgres?host=/var/tmp&port=$PORTA\""
echo "  npm test"
echo
echo "Para derrubar:  pg_ctl -D $DADOS/data stop"

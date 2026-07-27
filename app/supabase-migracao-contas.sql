-- =====================================================================
-- Sistema TI · CONTAS A PAGAR, CONTAS FIXAS E OBJETIVOS
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase, depois das outras migrações.
-- =====================================================================

create table if not exists contas_pagar (
  id text primary key,
  descricao text not null,
  categoria text,
  valor numeric not null default 0,
  -- Próximo vencimento. Nas contas recorrentes esta data avança a cada baixa.
  vencimento text,
  recorrencia text not null default 'mensal'
    check (recorrencia in ('unica','semanal','mensal','bimestral','trimestral','anual')),
  "fornecedorId" text,
  "lembreteDias" integer not null default 3,
  ativo boolean not null default true,
  -- Reposição de estoque não é despesa do resultado (mesma regra do caixa)
  "compraEstoque" boolean default false,
  pagamentos jsonb not null default '[]'::jsonb,
  observacoes text,
  "criadoEm" text,
  "lojaId" uuid
);

create table if not exists metas (
  id text primary key,
  titulo text not null,
  tipo text not null check (tipo in ('faturamento','lucro','os','teto_gasto')),
  alvo numeric not null default 0,
  periodo text not null default 'mensal' check (periodo in ('mensal','anual')),
  ativo boolean not null default true,
  "criadoEm" text,
  "lojaId" uuid
);

create index if not exists contas_loja_idx on contas_pagar ("lojaId");
create index if not exists contas_venc_idx on contas_pagar ("lojaId", vencimento);
create index if not exists metas_loja_idx on metas ("lojaId");

alter table contas_pagar enable row level security;
alter table metas enable row level security;

-- Mesmo isolamento das demais tabelas: cada loja só vê o que é seu, e a
-- gravação exige assinatura em dia.
do $$
declare t text;
begin
  foreach t in array array['contas_pagar', 'metas']
  loop
    execute format('drop policy if exists "loja_ler" on %I;', t);
    execute format('drop policy if exists "loja_inserir" on %I;', t);
    execute format('drop policy if exists "loja_alterar" on %I;', t);
    execute format('drop policy if exists "loja_apagar" on %I;', t);

    execute format($f$
      create policy "loja_ler" on %I
        for select to authenticated using ("lojaId" = loja_atual());
    $f$, t);

    execute format($f$
      create policy "loja_inserir" on %I
        for insert to authenticated
        with check ("lojaId" = loja_atual() and loja_pode_gravar());
    $f$, t);

    execute format($f$
      create policy "loja_alterar" on %I
        for update to authenticated
        using ("lojaId" = loja_atual() and loja_pode_gravar())
        with check ("lojaId" = loja_atual() and loja_pode_gravar());
    $f$, t);

    execute format($f$
      create policy "loja_apagar" on %I
        for delete to authenticated
        using ("lojaId" = loja_atual() and loja_pode_gravar());
    $f$, t);
  end loop;
end $$;

-- ---------- Lembretes já enviados ----------
-- Evita o mesmo aviso todo dia. A chave inclui o vencimento, então quando a
-- conta é paga e avança de ciclo o lembrete volta a valer naturalmente.
create table if not exists avisos_contas (
  id uuid primary key default gen_random_uuid(),
  "lojaId" uuid not null references lojas (id) on delete cascade,
  conta_id text not null,
  referencia text not null,
  tipo text not null,
  "criadoEm" timestamptz not null default now(),
  unique (conta_id, referencia, tipo)
);

alter table avisos_contas enable row level security;

drop policy if exists "avisos_contas_ler" on avisos_contas;
create policy "avisos_contas_ler" on avisos_contas
  for select to authenticated using ("lojaId" = loja_atual());

-- ---------- Serviço no cadastro de produtos ----------
-- Formatação, instalação e limpeza não têm estoque. Sem esta marca, o
-- atendente digitava 99999999999 na quantidade para o item não ficar
-- vermelho, e o valor do estoque ia para a casa dos trilhões.
alter table produtos add column if not exists servico boolean default false;

-- =====================================================================
-- DEPOIS DE RODAR:
--   Aparece o menu "Contas a Pagar", com contas fixas, lembretes,
--   relatório de gastos e objetivos. No cadastro de produto passa a
--   existir a opção "É um serviço, não uma peça".
-- =====================================================================

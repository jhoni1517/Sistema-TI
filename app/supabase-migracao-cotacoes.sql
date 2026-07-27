-- =====================================================================
-- Sistema TI · COTAÇÃO COM FORNECEDOR
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase, depois das outras migrações.
--
-- Para que serve: chega uma OS e a peça não está no estoque. Em vez de
-- cadastrar produto fantasma com quantidade zero, o técnico abre uma
-- cotação. O sistema monta a mensagem para o fornecedor já com o último
-- valor pago como referência, e quando a resposta chega ela vira estoque
-- e saída de caixa em um clique.
-- =====================================================================

create table if not exists cotacoes (
  id text primary key,
  numero integer not null default 1,
  "fornecedorId" text,
  "osId" text,
  itens jsonb not null default '[]'::jsonb,
  status text not null default 'aberta'
    check (status in ('aberta', 'respondida', 'comprada', 'recusada')),
  observacoes text,
  "enviadoEm" text,
  "respondidoEm" text,
  "compradoEm" text,
  "criadoEm" text,
  "lojaId" uuid
);

-- Histórico de preços: é daqui que sai o "último valor pago".
-- Guardar o preço no produto não bastaria — o mesmo item custa diferente
-- em cada fornecedor, e o que interessa é a variação ao longo do tempo.
create table if not exists precos_fornecedor (
  id text primary key,
  "produtoId" text,
  descricao text not null,
  "fornecedorId" text,
  preco numeric not null default 0,
  quantidade numeric not null default 1,
  data text,
  "lojaId" uuid
);

create index if not exists cotacoes_loja_idx on cotacoes ("lojaId");
create index if not exists precos_loja_idx on precos_fornecedor ("lojaId");
create index if not exists precos_busca_idx
  on precos_fornecedor ("lojaId", "fornecedorId", "produtoId");

alter table cotacoes enable row level security;
alter table precos_fornecedor enable row level security;

-- Mesmo isolamento das demais tabelas: cada loja só enxerga o que é seu
do $$
declare t text;
begin
  foreach t in array array['cotacoes', 'precos_fornecedor']
  loop
    execute format('drop policy if exists "loja_isolada" on %I;', t);
    execute format($f$
      create policy "loja_isolada" on %I
        for all to authenticated
        using ("lojaId" = loja_atual())
        with check ("lojaId" = loja_atual());
    $f$, t);
  end loop;
end $$;

-- =====================================================================
-- DEPOIS DE RODAR:
--   Nada. A aba "Cotações" aparece dentro de Estoque.
-- =====================================================================

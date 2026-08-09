-- ============================================================
--  Comanda de mesa
-- ============================================================
--
-- Um pedido que fica ABERTO e vai recebendo item ao longo do tempo: a mesa
-- 5 pede duas cervejas, meia hora depois pede a pizza, e só no fim tudo
-- vira uma venda só.
--
-- Por que não reaproveitar a tabela de vendas: a venda do balcão nasce e
-- morre no mesmo minuto, com o cliente na frente. A comanda vive uma hora,
-- muda de mão entre garçons e precisa dizer à cozinha o que já saiu e o que
-- falta. É o mesmo desenho de estado da OS, não o do caixa.
--
-- A COMANDA NÃO É DINHEIRO ATÉ SER FECHADA. Nada entra no caixa enquanto
-- ela está aberta, e nada baixa do estoque. Fechar é que gera a venda e o
-- movimento — lançar a cada item faria o fechamento do dia contar a mesa 5
-- seis vezes, e cancelar um item viraria estorno.
--
-- Os itens ficam em jsonb, como em `vendas`: eles só são lidos junto com a
-- comanda, nunca sozinhos, e uma tabela filha obrigaria duas gravações para
-- cada cerveja pedida — com a chance de a segunda falhar sozinha.
--
-- Repetível: pode rodar de novo sem quebrar nada.

create table if not exists comandas (
  id text primary key,
  numero integer not null,
  -- Texto livre: "5", "Balcão", "Viagem". Restaurante de bairro não tem
  -- mesa numerada em cadastro, e um cadastro de mesas seria mais uma tela
  -- que ninguém preenche.
  mesa text not null,
  -- Cada item leva o que a cozinha precisa: id próprio (a fila trabalha
  -- item a item), etapa de preparo, hora do pedido e o recado do cliente.
  itens jsonb not null default '[]'::jsonb,
  -- aberta / fechada / cancelada
  status text not null default 'aberta',
  "abertaEm" text,
  "fechadaEm" text,
  -- A venda gerada no fechamento. É por ela que se chega ao caixa.
  "vendaId" text,
  "clienteId" text,
  garcom text,
  observacoes text,
  -- A gorjeta em porcentagem do consumo, e o abatimento em reais combinado
  -- no salão. Ficam na comanda e não só na configuração porque o cliente
  -- pode recusar a taxa, e a mesa que recusou tem que continuar recusando
  -- quando a tela recarregar.
  "taxaServico" numeric,
  desconto numeric,
  "criadoEm" text,
  "atualizadoEm" text,
  "lojaId" uuid
);

-- Para quem já rodou a versão anterior desta migração: a tabela existe e o
-- `create table if not exists` acima não acrescenta coluna nenhuma.
alter table comandas add column if not exists "taxaServico" numeric;
alter table comandas add column if not exists desconto numeric;

-- Entrega. A mesma tabela guarda a comanda de mesa e o pedido de entrega:
-- por dentro são a mesma coisa (uma conta aberta que vira venda, caixa e
-- baixa de estoque), e o que muda são estes campos. Vazio em `tipo` é mesa,
-- que é como voltam as linhas gravadas antes de a entrega existir.
alter table comandas add column if not exists tipo text;
alter table comandas add column if not exists endereco text;
alter table comandas add column if not exists telefone text;
alter table comandas add column if not exists "taxaEntrega" numeric;
alter table comandas add column if not exists entregador text;
alter table comandas add column if not exists "trocoPara" numeric;
alter table comandas add column if not exists "saiuEm" text;

create index if not exists comandas_loja_idx on comandas ("lojaId");
-- A tela do salão e a da cozinha só querem as ABERTAS. Sem este índice as
-- duas varrem o histórico inteiro da loja a cada atualização — e a tela da
-- cozinha se atualiza sozinha o tempo todo.
create index if not exists comandas_abertas_idx on comandas ("lojaId", status);

alter table comandas enable row level security;

-- Mesmo isolamento das demais tabelas: cada loja só vê o que é seu, e a
-- gravação exige assinatura em dia.
drop policy if exists "loja_ler" on comandas;
create policy "loja_ler" on comandas
  for select to authenticated using ("lojaId" = loja_atual());

drop policy if exists "loja_inserir" on comandas;
create policy "loja_inserir" on comandas
  for insert to authenticated
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

drop policy if exists "loja_alterar" on comandas;
create policy "loja_alterar" on comandas
  for update to authenticated
  using ("lojaId" = loja_atual() and loja_pode_gravar())
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

drop policy if exists "loja_apagar" on comandas;
create policy "loja_apagar" on comandas
  for delete to authenticated
  using ("lojaId" = loja_atual() and loja_pode_gravar());

-- ---------- Confere ----------
select column_name, data_type
  from information_schema.columns
 where table_name = 'comandas'
 order by ordinal_position;

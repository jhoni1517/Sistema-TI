-- =====================================================================
-- Sistema TI · RAMO NOVO: MOTORES E BOMBAS
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase. É seguro repetir.
--
-- Rebobinamento de motor elétrico, manutenção de bomba d'água, motor
-- monofásico e trifásico. É assistência técnica com outro conteúdo: usa a
-- ordem de serviço inteira — laudo, orçamento com opções, aprovação pelo
-- link, garantia, peças e caixa. O que muda é o que se pergunta na entrada.
--
-- ---------------------------------------------------------------------
-- POR QUE ISTO É UMA MIGRAÇÃO, E NÃO SÓ UMA LINHA NO CÓDIGO
--
-- `lojas.ramo` tem uma trava `check` com os ramos aceitos, escrita quando o
-- ramo deixou de morar no JSON de configurações. Ela existe porque a tela
-- não protege nada: quem contratou mercearia podia se virar pizzaria sozinho
-- e usar o que não pagou.
--
-- Acrescentar o ramo só no TypeScript deixaria o sistema pronto e o banco
-- recusando a gravação — o administrador escolheria "Motores e bombas" em
-- Ajustes e receberia um erro de violação de restrição. É a mesma família do
-- erro que já custou caro aqui: campo novo no código exige o banco saber
-- dele, no mesmo commit.
--
-- ---------------------------------------------------------------------
-- AS COLUNAS DA PLACA
--
-- Potência, tensão, rotação e fases são os quatro números que o rebobinador
-- anota ANTES de abrir. Sem eles não dá para calcular a bitola do fio, nem
-- conferir na volta se o motor saiu igual ao que entrou — e é justamente
-- essa conferência que o cliente cobra quando o motor esquenta depois do
-- conserto.
--
-- Texto e não número, de propósito: "3/4 cv", "220/380V" e "1750 rpm" é como
-- está escrito na plaqueta. Obrigar a converter faria o atendente arredondar
-- de cabeça na frente do cliente, e o dado deixaria de ser cópia do que está
-- gravado no metal.
--
-- (Elas também estão em supabase-corrigir-colunas.sql, que é o arquivo que
-- repete todas as colunas opcionais. Repetir aqui é de propósito: quem roda
-- só esta migração fica com o ramo funcionando por inteiro.)
-- =====================================================================

-- ---------- A trava passa a aceitar o ramo novo ----------
-- `drop constraint` antes de criar, como toda migração da casa: rodar de
-- novo não pode quebrar. O nome vem do padrão do Postgres para check de
-- coluna — <tabela>_<coluna>_check.
alter table lojas drop constraint if exists lojas_ramo_check;

alter table lojas add constraint lojas_ramo_check
  check (
    ramo is null
    or ramo in ('assistencia', 'motores', 'mercearia', 'pizzaria', 'bebidas')
  );

-- ---------- A placa do equipamento ----------
alter table ordens add column if not exists potencia text;
alter table ordens add column if not exists tensao text;
alter table ordens add column if not exists rotacao text;
alter table ordens add column if not exists fases text;

comment on column ordens.potencia is 'Placa do motor: 1,5 CV, 3/4 cv. Texto, como está na plaqueta.';
comment on column ordens.tensao is 'Placa do motor: 220/380V.';
comment on column ordens.rotacao is 'Placa do motor: 1750 rpm.';
comment on column ordens.fases is 'Monofásico, bifásico ou trifásico.';

-- ---------- Confere ----------
-- A primeira tem que devolver a restrição já com 'motores' no meio.
select conname, pg_get_constraintdef(oid) as regra
  from pg_constraint
 where conrelid = 'lojas'::regclass
   and conname = 'lojas_ramo_check';

-- A segunda, quatro linhas.
select column_name, data_type
  from information_schema.columns
 where table_name = 'ordens'
   and column_name in ('potencia', 'tensao', 'rotacao', 'fases')
 order by column_name;

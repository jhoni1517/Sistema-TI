-- ============================================================
--  Teste grátis: a loja nova nasce com prazo
-- ============================================================
--
-- O PROBLEMA QUE ISTO CONSERTA
--
-- `situacao_loja()` diz, e continua dizendo:
--
--     if v_vence is null then return 'ativa'; end if;
--
-- Ou seja: loja SEM data de vencimento é ativa para sempre. E era assim que
-- toda loja nova nascia — `venceEm` em branco. Na prática, quem entrava no
-- sistema ganhava acesso ilimitado e de graça, sem nada na tela do
-- administrador indicando isso: a lista mostrava "Em dia", que é verdade e
-- é justamente o que engana.
--
-- Pior: `dias_teste` já existia em `sistema_config`, com campo na tela de
-- Lojas assinantes. Ninguém lia. Era um número que o administrador
-- configurava e que não fazia nada — a mesma classe de defeito de um aviso
-- que não vira cobrança.
--
-- ------------------------------------------------------------
-- POR QUE UM GATILHO, E NÃO UM DEFAULT NA COLUNA
--
-- O prazo do teste é configurável (`sistema_config.dias_teste`) e pode
-- mudar. `default now() + interval '7 days'` congelaria o número no dia em
-- que a coluna foi criada, e mudar a configuração não teria efeito nenhum
-- sobre as lojas seguintes — de novo um campo que não faz nada.
-- ------------------------------------------------------------
--
-- O QUE ESTE ARQUIVO NÃO FAZ, DE PROPÓSITO
--
-- Ele NÃO mexe nas lojas que já existem. Rodar um `update` que põe prazo em
-- quem hoje não tem cortaria o acesso de cliente pagante que só não tem a
-- data preenchida — e cortar acesso de quem paga é o erro mais caro que
-- este sistema pode cometer. As lojas antigas continuam como estão, e o
-- administrador libera o teste uma a uma, pelo botão da tela.
--
-- Repetível: pode rodar de novo sem quebrar nada.

/* ---------- O prazo padrão do teste ---------- */

-- 7 dias: é o que dá para experimentar um sistema de balcão sem que ele
-- vire hábito de graça. Muda na tela de Lojas assinantes.
update sistema_config set dias_teste = coalesce(dias_teste, 7) where id;

/* ---------- A loja nova nasce com prazo ---------- */

create or replace function iniciar_teste_gratis()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_dias integer;
begin
  -- Prazo já informado manda: é o administrador cadastrando uma loja que
  -- já pagou, e sobrescrever isso daria um mês de graça a quem comprou.
  if new."venceEm" is not null then return new; end if;
  -- A loja isenta é a de quem administra o sistema: não tem teste, não tem
  -- cobrança, não vence.
  if coalesce(new.isento, false) then return new; end if;

  select coalesce(dias_teste, 7) into v_dias from sistema_config where id;
  -- Zero ou negativo = a casa não dá teste. Nesse caso a loja nasce sem
  -- prazo, como antes, e o administrador decide.
  if v_dias is null or v_dias <= 0 then return new; end if;

  new."venceEm" := now() + (v_dias || ' days')::interval;
  return new;
end $$;

drop trigger if exists lojas_teste_gratis on lojas;
create trigger lojas_teste_gratis
  before insert on lojas
  for each row execute function iniciar_teste_gratis();

/* ---------- Liberar teste para uma loja que já existe ---------- */

/*
 * O botão da tela chama esta função.
 *
 * Ela existe como função do banco, e não como um update direto da tela, por
 * um motivo: quem pode mexer em prazo de assinatura é só quem administra o
 * sistema. `security definer` mais a checagem de super admin garantem isso
 * do lado do banco — a trava não pode depender de a tela esconder o botão.
 */
create or replace function liberar_teste(p_loja uuid, p_dias integer default null)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  v_dias integer;
  v_novo timestamptz;
begin
  if not sou_super_admin() then
    raise exception 'Só quem administra o sistema pode liberar teste.';
  end if;

  select coalesce(p_dias, dias_teste, 7) into v_dias from sistema_config where id;
  if v_dias is null or v_dias <= 0 then
    raise exception 'O prazo de teste está zerado em Ajustes.';
  end if;

  -- A partir de HOJE, e não do vencimento anterior: liberar teste para quem
  -- está vencido há três meses não pode dar três meses de crédito.
  v_novo := now() + (v_dias || ' days')::interval;
  update lojas set "venceEm" = v_novo where id = p_loja;
  return v_novo;
end $$;

grant execute on function liberar_teste(uuid, integer) to authenticated;

/* ---------- Confere ---------- */

-- Tem que listar o gatilho `lojas_teste_gratis` e as lojas SEM prazo, que
-- são as que hoje usam o sistema de graça e para sempre.
select tgname from pg_trigger where tgname = 'lojas_teste_gratis';

select id, nome, "venceEm", isento
  from lojas
 where "venceEm" is null and coalesce(isento, false) = false
 order by nome;

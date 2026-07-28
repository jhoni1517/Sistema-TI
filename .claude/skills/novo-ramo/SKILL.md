---
name: novo-ramo
description: Passo a passo para atender um nicho novo (mercearia, pizzaria, bebidas, padaria, petshop...) dentro do Sistema TI, ou para acrescentar um módulo ou campo a um ramo que já existe. Use quando o pedido envolver "sistema para <tipo de loja>", criar PDV, delivery, comanda de mesa, fila de preparo, controle de validade, produto por peso, ou qualquer tela que só serve para parte das lojas.
---

# Atender um nicho novo

## Antes de escrever qualquer código

Leia `app/src/lib/ramos.ts`. É o único lugar onde a diferença entre os
nichos existe, e o cabeçalho dele explica a regra que segura tudo de pé.

**Um sistema só, não um repositório por nicho.** Quem mantém isto é uma
pessoa. Com quatro cópias, o bug que fazia a venda sumir em silêncio seria
consertado quatro vezes — e a terceira seria esquecida.

## A pergunta que decide tudo: é tela ou é campo?

Erre isso e o sistema fica impossível de manter.

| | Módulo | Recurso |
|---|---|---|
| O que é | Tela nova, com endereço no menu | Campo ou regra numa tela existente |
| Custo | Alto: escrever, testar, e funcionar em qualquer combinação | Quase zero |
| Exemplos | PDV, Delivery, Comandas, Fila de preparo | IMEI, garantia, peso, validade, idade mínima |

**Teste rápido:** tem endereço próprio no menu? É módulo. Senão é recurso.

Dez módulos dão mil combinações para testar, e você vai testar umas cinco.
Dez recursos não geram combinação nenhuma, porque não interagem entre si.

Na dúvida, comece como recurso. Promover recurso a módulo depois é fácil;
o contrário significa apagar uma tela que alguém já usa.

## O que já é core, e você NÃO reescreve

Caixa, estoque, clientes, fiado, contas a pagar, agenda, relatórios,
configurações, assinatura, login, multi-loja, backup, PWA, notificações.

São cerca de 5.000 linhas já testadas. Um nicho novo aproveita tudo isso.
Se você está prestes a escrever "cadastro de produto" de novo, pare.

## Passo a passo

### 1. Declarar o ramo

Em `app/src/lib/ramos.ts`, acrescente a chave em `Ramo` e a entrada em
`RAMO_META`, com:

- `label` e `descricao` — aparecem na escolha em Configurações
- `vocabulario` — como o documento central se chama ali. "Ordem de serviço"
  numa pizzaria é ridículo; "pedido" numa assistência é impreciso.
- `modulos` — só as telas que esse ramo realmente usa
- `recursos` — os campos

Rode `npm test`. `ramos.test.ts` cobra vocabulário completo, módulo sem
dono e duplicata.

### 2. Se precisar de tela nova

1. Acrescente a chave em `Modulo` (`ramos.ts`)
2. Crie a página em `app/src/pages/`
3. Registre a rota em `App.tsx`
4. Acrescente ao `nav` em `Layout.tsx` **com o campo `modulo`** — sem isso
   a tela aparece para todo mundo
5. Se guardar dado novo: tipo em `types.ts`, tabela em `lib/db.ts`, estado
   e ações no `AppStore`, migração SQL, e a coluna em
   `supabase-corrigir-colunas.sql`

### 3. Se for só campo

Não crie tela. Use `temRecurso(config.ramo, "...")` para mostrar ou
esconder o campo onde ele já faria sentido.

### 4. Antes do push

```bash
cd app && npm test && npm run build
```

`tsc --noEmit` passar não basta — já aconteceu de o build quebrar mesmo
assim.

## Regras que não se negociam

Estão detalhadas no `CLAUDE.md` da raiz. As que mais pegam em nicho novo:

- **Campo novo no tipo = coluna nova no SQL, no mesmo commit.** O erro
  `Could not find the 'x' column` derruba toda a gravação da tabela, em
  silêncio, e a venda some.
- **Toda gravação de tela com `try/catch` que mostra a mensagem crua.**
- **Data é `AAAA-MM-DD` e a conta é em UTC.** Dia 31, 29/02 e virada de ano
  têm teste.
- **Compra de estoque não é despesa do mês.** Vira custo quando vende.
- **Regra de dinheiro mora em `lib/`, com teste, nunca no componente.**
- **Português em tudo**, e comentário que explica o porquê — de preferência
  o porquê que veio de um bug.

## O que muda em cada nicho, na prática

Serve de mapa, não de especificação. Confirme com o dono da loja antes.

**Mercearia / mercado**
Balcão rápido é tudo: o cliente está na fila. Venda sem cadastrar cliente,
busca por código de barras, e nada de modal entre o produto e o troco.
Produto por peso precisa de preço por kg. Validade vira alerta no estoque,
não tela nova.

**Pizzaria / lanchonete**
O pedido tem estado de preparo — que é o mesmo desenho da OS: recebido, em
preparo, pronto, entregue. A cozinha precisa de uma tela própria, grande,
que atualiza sozinha. Comanda de mesa é um pedido que fica aberto. Entrega
tem endereço, taxa e entregador; o fechamento do entregador é aba de
Delivery, não tela solta.

**Loja de bebidas / adega**
É mercearia com entrega. Restrição de idade é aviso na venda, não bloqueio
— quem confere é a pessoa no balcão, e um sistema que impede vira sistema
contornado por fora.

## Ao terminar

Se o nicho ensinou alguma regra nova — um jeito de quebrar que ninguém
esperava — escreva no `CLAUDE.md`. É o único lugar onde o aprendizado
sobrevive à conversa que o gerou.

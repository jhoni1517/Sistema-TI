# O que os sistemas líderes de cada nicho fazem

Levantamento feito em julho de 2026 sobre o que os sistemas mais usados de
cada ramo entregam, e o que falta aqui para o nosso não ser "assistência
técnica pintada de outra cor".

Fontes no fim do arquivo. A ordem dentro de cada nicho é por valor: o
primeiro item é o que define o ramo — sem ele o sistema não é daquele nicho,
por mais telas que tenha.

---

## Mercearia / mercado

Referências: MarketUP, Kyte, MercadinhoPDV, Lojista Pro, SISMEGA.

| # | O que é | Situação |
|---|---|---|
| 1 | **Etiqueta de balança (EAN-13 prefixo 2)** — o código impresso traz o peso dentro | **Feito** |
| 2 | **NFC-e** — cupom fiscal eletrônico | Não feito, ver abaixo |
| 3 | **Lote e validade com FIFO** — vende primeiro o que vence antes, e bloqueia vencido | Parcial: alerta de validade existe, FIFO não |
| 4 | **PDV que funciona sem internet** e sincroniza depois | Não feito |
| 5 | **Tabela de preço** (varejo / atacado) e desconto por volume | Não feito |

### Sobre a etiqueta de balança

É o item que separa os dois mundos. A balança do açougue e do frios imprime
uma etiqueta cujo código de barras muda a cada pacote, porque o peso está
dentro dele:

```
2 CCCCCC VVVVV D
│ │      │     └─ dígito verificador
│ │      └─────── peso em gramas, ou preço em centavos
│ └────────────── código do produto na balança
└──────────────── prefixo de produto pesado
```

Sem decodificar isso, o operador digita o peso na mão a cada pacote e a
balança não serve para nada. Ver `lib/balanca.ts`.

Duas armadilhas, ambas com teste:

- **Peso e preço são a mesma sequência de dígitos.** `00784` é 784 gramas ou
  R$ 7,84 conforme a configuração da balança. Ler no formato errado não dá
  erro — dá um número plausível e errado, que é pior. Por isso a loja
  escolhe o formato em Configurações.
- **O dígito verificador é conferido.** Etiqueta amassada e leitura torta
  acontecem o dia inteiro; um código lido errado viraria outro produto ou um
  peso absurdo.

---

## Pizzaria / lanchonete

Referências: Food Sistemas, OnChef, Simpliza, KCMS, Controle na Mão.

| # | O que é | Situação |
|---|---|---|
| 1 | **Pizza meio a meio** (2 a 4 sabores) com regra de preço | Não feito |
| 2 | **KDS / fila de preparo** — tela da cozinha, cor por atraso, divisão por estação | Não feito |
| 3 | **Comanda por mesa** com divisão de conta | Não feito |
| 4 | **Taxa de entrega por bairro** e fechamento do entregador | Não feito |
| 5 | **Ficha técnica** — custo real de cada pizza a partir dos ingredientes | Não feito |

### Onde mora a dificuldade

**Meio a meio não é desconto, é regra de preço.** Metade calabresa (R$ 45) e
metade portuguesa (R$ 52) pode custar R$ 52 (o maior sabor), R$ 48,50 (a
média) ou a soma das metades, dependendo da casa. A regra é escolhida pela
loja e precisa estar em `lib/`, com teste — é dinheiro.

**O KDS é uma tela de parede, não de balcão.** Fonte grande, atualiza
sozinha, ninguém toca. Desenho diferente de tudo que existe aqui.

**A comanda de mesa é um pedido que fica aberto** e vai recebendo itens.
O fluxo de estado é o mesmo da OS (recebido, em preparo, pronto, entregue),
o que economiza bastante — mas a tela é outra.

---

## Loja de bebidas / adega

Referências: Xpertus ERP, MBM Solutions, Andra ERP, Nex, Siscoban.

| # | O que é | Situação |
|---|---|---|
| 1 | **Casco / vasilhame retornável** — saldo por cliente, envio e retorno | Não feito |
| 2 | **Tabela de preço** por tipo de cliente (bar, restaurante, varejo) | Não feito |
| 3 | **Lote, validade e FIFO** | Parcial |
| 4 | **Entrega por região** com romaneio de carga | Não feito |
| 5 | **Idade mínima** na venda | Não feito (recurso já declarado) |

### Sobre o casco

É o que define o nicho, e é uma conta de saldo, não um campo: o cliente leva
12 garrafas e devolve 8; ficam 4 pendentes. Meia implementação produz um
saldo errado, que é pior do que não ter saldo nenhum. Precisa de
lançamento de ida e volta, com histórico.

### Sobre a idade mínima

Aviso na venda, nunca bloqueio. Quem confere o documento é a pessoa no
balcão; um sistema que impede vira sistema contornado por fora, e aí a loja
perde o controle de verdade.

---

## O que está fora de alcance por enquanto, e por quê

**NFC-e (cupom fiscal).** Não é uma tela: exige certificado digital A1 da
loja, credenciamento na SEFAZ do estado, contingência quando a SEFAZ cai, e
responsabilidade legal sobre o que é emitido. É um projeto próprio, não uma
funcionalidade. Enquanto não existir, o cupom que sai daqui diz "documento
sem valor fiscal" — o que é honesto e legal, desde que a loja emita a nota
por outro caminho.

**iFood, Rappi.** Dependem de programa de parceria e aprovação das
plataformas. Não dá para simplesmente implementar.

---

## Ordem sugerida

Cada bloco abaixo é entregável sozinho e não depende dos outros.

1. ~~Etiqueta de balança~~ — feito
2. **Casco retornável** (bebidas) — uma tabela de lançamentos e um saldo por
   cliente. O menor dos três que definem nicho.
3. **Meio a meio + comanda de mesa + KDS** (pizzaria) — o maior. São três
   telas novas, e faz sentido fazer as três juntas porque uma sem a outra
   não fecha o fluxo da casa.
4. **Lote com FIFO** (mercearia e bebidas) — muda o modelo de estoque: hoje
   o produto tem uma quantidade só, e passaria a ter lotes.
5. **Tabela de preço** (mercearia e bebidas) — barato perto do resto.

---

## Fontes

- [Sistemas PDV: os melhores do mercado para 2026](https://www.idinheiro.com.br/negocios/melhores-sistemas-pdv/)
- [Sistema para Mercadinho — Lojista Pro](https://lojistapro.com.br/sistema-para-mercadinho)
- [Sistema PDV para Mercearia — SISMEGA](https://www.sismega.com.br/sistema-pdv-para-mercearia)
- [Leitura de código de barras com peso e preço — Demander](https://atendimento.demander.com.br/kb/pt-br/article/576798/leitura-de-codigo-de-barras-com-peso-e-preco)
- [Código de barras EAN-13 na balança — Doutor Balança](https://drbalanca.com.br/artigo/codigo-barras-ean-13-origem-composicao-vantagens/)
- [Tipos de códigos de barras — GS1 Brasil](https://blog.gs1br.org/tipos-de-codigos-de-barras/)
- [Sistema para Pizzaria — Food Sistemas](https://foodsistemas.com.br/segmentos/sistema-para-pizzaria/)
- [KDS para restaurante — Food Sistemas](https://foodsistemas.com.br/funcionalidades/kds/)
- [Qual o melhor sistema para pizzarias em 2026 — OnChef](https://blog.onchef.com.br/blog/qual-o-melhor-sistema-para-pizzarias-em-2026)
- [Sistema para distribuidora de bebidas: vasilhames e retornáveis — MBM](https://mbmsolutions.com.br/sistema-para-distribuidora-de-bebidas)
- [Sistema PDV para distribuidora de bebidas — DistribuidorPro](https://distribuidorpro.com.br/blog/sistema-pdv-para-distribuidora-de-bebidas-guia-completo-2025)

# Novidades

O sininho do sistema lê este arquivo. Cada novidade é um bloco:

    ## AAAA-MM-DD · Título curto
    Uma frase, em voz de balcão, dizendo o que a loja ganha.
    Rota: /endereco-no-sistema
    Módulo: os            (opcional: só aparece para quem tem o módulo)

A mais nova vai em cima. Rota errada ou data inválida reprova o
`novidades.test.ts` — novidade que leva para lugar nenhum é pior que
nenhuma.

## 2026-09-25 · Orçamento em 3 níveis
Econômica, Recomendada e Premium lado a lado no link do cliente, cada uma com sua garantia. Em Relatórios, veja qual ele mais escolhe.
Rota: /ordens
Módulo: os

## 2026-09-25 · Ficha do aparelho pelo IMEI
Digitou o IMEI na OS nova, o sistema mostra se o aparelho já passou aqui, as peças trocadas e se ainda está na garantia.
Rota: /ordens
Módulo: os

## 2026-09-25 · Termo assinado com o dedo
Na entrada e na retirada, o cliente assina na tela do celular. O termo fica lacrado na OS e sai em PDF.
Rota: /ordens
Módulo: os

## 2026-09-25 · Etiqueta com QR no aparelho
Imprima na bobina e cole na capinha: o cliente escaneia, vê o conserto e, depois de entregue, aciona a garantia.
Rota: /ordens
Módulo: os

## 2026-09-24 · Indique e ganhe
Mande seu link para outro lojista: ele ganha 30 dias a mais de teste e você ganha 1 mês grátis quando ele assinar.
Rota: /assinatura

## 2026-09-24 · Importar do caderno por foto
Tire foto do caderno de clientes ou da lista de produtos e o sistema cadastra tudo, com você conferindo antes.
Rota: /clientes

## 2026-09-23 · Área do cliente
O cliente entra com CPF e senha e acompanha todos os consertos dele, com as garantias que ainda valem.
Rota: /config
Módulo: os

## 2026-09-23 · Link de cadastro para o cliente
Mande pelo WhatsApp e o cliente preenche o próprio cadastro. Cai direto na sua lista.
Rota: /clientes

## 2026-09-22 · Escolha o fundo do sistema
Balcão, Clássico (o roxinho de antes), Grafite, Oficina ou Lavanda, em Configurações, Aparência.
Rota: /config

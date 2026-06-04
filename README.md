ERP da K2 Salgados (MVP)

## O que já existe (MVP)

- Dashboard inspirado na imagem de referência
- Importação de `produtos` e `clientes` a partir dos PDFs anexados
- Estoque (ajuste manual de entrada/saída/ajuste)
- Pedidos (lista + criação simples)
- Financeiro (lista de recebíveis gerados ao criar pedido com preço)
- Telas “em breve” para Produção, NF, Relatórios, Fornecedores e Configurações

## Setup

1) Instalar dependências

```bash
npm i
```

2) (Opcional) Re-extrair os PDFs para JSON

Antes de extrair os PDFs, instale as dependências Python:

```bash
python3 -m pip install -r requirements.txt
```

Se o arquivo `requirements.txt` ainda não existir na sua branch/Codespace, instale a biblioteca diretamente:

```bash
python3 -m pip install pdfplumber
```

Para atualizar somente a lista de clientes a partir do PDF:

```bash
python3 scripts/extract_pdfs.py --clients-pdf "todos os clientes (1).pdf" --out-dir data
```

Se esse comando responder que `--products-pdf` é obrigatório, o Codespace ainda está com uma versão antiga do script. Atualize a branch antes de tentar novamente:

```bash
git pull
```

Para re-extrair produtos e clientes juntos:

```bash
python3 scripts/extract_pdfs.py --products-pdf "/Users/vitormaria/Downloads/todos os produtos.pdf" --clients-pdf "/Users/vitormaria/Downloads/todos os clientes.pdf" --out-dir data
```

> Atenção: se o PDF tiver dados pessoais de clientes e o repositório estiver público, remova o PDF do GitHub depois de gerar os arquivos JSON.

3) Configurar o Supabase

- Crie o banco no Supabase
- Copie a `DATABASE_URL` para o `.env`
- Rode a migração inicial de dados locais uma única vez:

```bash
npm run db:migrate:supabase
```

4) Rodar em desenvolvimento

```bash
npm run dev
```

Abrir `http://localhost:3000` no navegador.

## Deploy na VPS (Docker)

Pré-requisitos:
- DNS `A` para `k2.varinteligencia.com` apontando para a VPS
- Portas `80` e `443` liberadas (UFW / painel)

Na VPS:

```bash
sudo apt update -y
sudo apt install -y git docker.io docker-compose-plugin
sudo systemctl enable --now docker

sudo mkdir -p /opt/erp-k2
sudo chown -R $USER:$USER /opt/erp-k2
cd /opt/erp-k2

git clone https://github.com/vitormaria1/erp-k2.git .

# Configure o ambiente antes de subir o container.
# O app fiscal exige as variáveis FISCAL_ISSUER_* e as credenciais da Focus NFe.
# Você pode partir de .env.example e ajustar os valores reais.
# Se o arquivo .env ainda não existir, o deploy sobe mesmo assim, mas a emissão fiscal fica indisponível até você criá-lo.

npm ci

docker compose up -d --build
```

HTTPS:
- Recomendo iniciar Cloudflare em **DNS only** (cinza), emitir o certificado, depois voltar para **Proxied** (laranja).

## Banco de dados

- Banco único: Supabase Postgres via `DATABASE_URL`
- Migração inicial dos dados locais para o Supabase:
  - configure `DATABASE_URL` no `.env`
  - rode `npm run db:migrate:supabase`
- O esquema do banco fica em `supabase/migrations/0001_customers_products.sql`

## Emissão fiscal

- Focus NFe:
  - homologação: `.env` com `FOCUS_NFE_ENV="homologacao"` e `FOCUS_NFE_TOKEN="..."`
  - produção: `.env` com `FOCUS_NFE_ENV="producao"`, `FOCUS_NFE_PROD_UNLOCK="YES"` e o token de produção da Focus
- Séries/numeração:
  - homologação: `FISCAL_NFE_SERIE_HOMOLOG`, `FISCAL_NFE_START_NUMBER_HOMOLOG`
  - produção: `FISCAL_NFE_SERIE_PROD`, `FISCAL_NFE_START_NUMBER_PROD`
- Emitente fiscal: `.env` com `FISCAL_ISSUER_*` completos
- Worker (fila/polling): `npm run fiscal:worker`

## Próximos passos sugeridos

- Produtos: definir `kind` (INSUMO vs PRONTO), `min_stock`, preço/custo
- Produção: fichas técnicas (BOM) e baixa automática de insumos
- NF-e: integração emissor + armazenamento de XML/chave + vinculação ao pedido
- Boletos: geração real (banco/PSP) + linha digitável/código de barras + PDF
- Relatórios: vendas por período, produtos mais vendidos, financeiro/DRE

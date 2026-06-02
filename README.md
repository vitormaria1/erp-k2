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

3) Inicializar o banco SQLite e importar os cadastros

```bash
npm run db:reset
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

# Banco (1ª vez) - ou copie seu erp.db atual para /opt/erp-k2/data/erp.db
mkdir -p data
npm ci
npm run db:migrate

docker compose up -d --build
```

HTTPS:
- Recomendo iniciar Cloudflare em **DNS only** (cinza), emitir o certificado, depois voltar para **Proxied** (laranja).

## Banco de dados

- Arquivo: `data/erp.db`
- Config: `.env` com `DATABASE_PATH="data/erp.db"`

## Camada fiscal (PostgreSQL + Focus NFe)

- Config: `.env` com `FISCAL_DATABASE_URL="postgres://..."`
- Postgres local:
  - Sem Docker: `npm run fiscal:db:pglite` (porta `54323`)
  - Com Docker: `npm run fiscal:db:up` (porta `54322`)
- Migração: `npm run fiscal:db:migrate`
- Emissão (homologação): `.env` com `FOCUS_NFE_ENV="homologacao"` e `FOCUS_NFE_TOKEN="..."`
- Worker (fila/polling): `npm run fiscal:worker`

## Próximos passos sugeridos

- Produtos: definir `kind` (INSUMO vs PRONTO), `min_stock`, preço/custo
- Produção: fichas técnicas (BOM) e baixa automática de insumos
- NF-e: integração emissor + armazenamento de XML/chave + vinculação ao pedido
- Boletos: geração real (banco/PSP) + linha digitável/código de barras + PDF
- Relatórios: vendas por período, produtos mais vendidos, financeiro/DRE

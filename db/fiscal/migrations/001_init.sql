BEGIN;

CREATE TABLE IF NOT EXISTS fiscal_migrations (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fiscal_product_fiscal_data (
  product_id text PRIMARY KEY,
  ncm varchar(8) NOT NULL,
  cest varchar(7),
  origem smallint NOT NULL,
  unidade_tributavel varchar(6) NOT NULL,
  cst_icms varchar(3) NOT NULL,
  cst_pis varchar(2) NOT NULL,
  cst_cofins varchar(2) NOT NULL,
  aliquota_icms numeric(7,4),
  aliquota_pis numeric(7,4),
  aliquota_cofins numeric(7,4),
  cfop_padrao varchar(4) NOT NULL,
  beneficios_fiscais jsonb NOT NULL DEFAULT '[]'::jsonb,
  tributacao_interna jsonb NOT NULL DEFAULT '{}'::jsonb,
  tributacao_interestadual jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fiscal_profiles (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fiscal_operations (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  natureza_operacao text NOT NULL,
  cfop varchar(4) NOT NULL,
  tipo_documento smallint NOT NULL,
  finalidade_emissao smallint NOT NULL,
  local_destino smallint NOT NULL,
  consumidor_final boolean NOT NULL DEFAULT false,
  devolucao boolean NOT NULL DEFAULT false,
  bonificacao boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fiscal_sequences (
  issuer_cnpj varchar(14) NOT NULL,
  model int NOT NULL,
  serie varchar(3) NOT NULL,
  next_number int NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer_cnpj, model, serie)
);

CREATE TABLE IF NOT EXISTS fiscal_invoices (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  issuer_cnpj varchar(14) NOT NULL,
  customer_id text NOT NULL,

  model int NOT NULL,
  serie varchar(3) NOT NULL,
  numero int,

  internal_status text NOT NULL,

  focus_ref text UNIQUE,
  focus_status text,

  sefaz_status text,
  sefaz_message text,
  chave_acesso varchar(44),
  protocolo_autorizacao text,

  xml_authorized text,
  danfe_pdf_path text
);

CREATE INDEX IF NOT EXISTS fiscal_invoices_issuer_model_serie_numero_idx
  ON fiscal_invoices (issuer_cnpj, model, serie, numero);

CREATE TABLE IF NOT EXISTS fiscal_events (
  id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES fiscal_invoices(id) ON DELETE CASCADE,
  type text NOT NULL,
  version int NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, version)
);

CREATE TABLE IF NOT EXISTS fiscal_jobs (
  id text PRIMARY KEY,
  kind text NOT NULL,
  status text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  run_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  invoice_id text REFERENCES fiscal_invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fiscal_jobs_status_run_at_idx ON fiscal_jobs (status, run_at);

COMMIT;

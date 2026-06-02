PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  cnpj TEXT,
  state_tax_id TEXT,
  taxpayer INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  trade_name TEXT,
  cep TEXT,
  street TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  uf TEXT,
  city_code TEXT,
  country TEXT,
  country_code TEXT,
  phone TEXT,
  email TEXT,
  home_page TEXT,
  tracks_orders INTEGER NOT NULL DEFAULT 0,
  registered_at TEXT,
  last_updated_at TEXT,
  blocked INTEGER NOT NULL DEFAULT 0,
  block_reason TEXT,
  customer_type_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  tele_ref TEXT,
  barcode TEXT,
  gtin TEXT,
  description TEXT NOT NULL,
  composition TEXT,
  unit TEXT NOT NULL DEFAULT 'UN',
  kind TEXT NOT NULL DEFAULT 'UNKNOWN', -- UNKNOWN | FINISHED | INPUT
  price REAL,
  cost REAL, -- custo atual (insumo = última compra; produto final = calculado pela receita)
  min_stock REAL,
  stock_qty REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | IN_PRODUCTION | READY_TO_SHIP | COMPLETED | CANCELED
  notes TEXT,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  type TEXT NOT NULL, -- IN | OUT | ADJUSTMENT
  quantity REAL NOT NULL,
  unit_cost REAL, -- preenchido em compras para atualizar custo do item
  reason_code TEXT, -- MANUAL | PURCHASE | SALE | PRODUCTION_CONSUME | PRODUCTION_FINISH | REVERSAL
  note TEXT,
  reason TEXT, -- legado (mantido para compatibilidade / histórico)
  order_id INTEGER,
  production_order_id TEXT,
  purchase_invoice_id TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE SET NULL,
  FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created ON stock_movements(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order_id ON stock_movements(order_id);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  order_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT | ISSUED | CANCELED
  number TEXT,
  invoice_key TEXT,
  issued_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);

CREATE TABLE IF NOT EXISTS receivables (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  order_id INTEGER,
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | PAID | OVERDUE | CANCELED
  method TEXT NOT NULL DEFAULT 'BOLETO', -- BOLETO | PIX | CASH | TRANSFER
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_receivables_customer_due ON receivables(customer_id, due_date);
CREATE INDEX IF NOT EXISTS idx_receivables_order_id ON receivables(order_id);

CREATE TABLE IF NOT EXISTS boletos (
  id TEXT PRIMARY KEY,
  receivable_id TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (receivable_id) REFERENCES receivables(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS loadings (
  id TEXT PRIMARY KEY,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loading_orders (
  loading_id TEXT NOT NULL,
  order_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (loading_id, order_id),
  FOREIGN KEY (loading_id) REFERENCES loadings(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_loading_orders_loading ON loading_orders(loading_id);
CREATE INDEX IF NOT EXISTS idx_loading_orders_order ON loading_orders(order_id);

CREATE TABLE IF NOT EXISTS product_recipes (
  product_id TEXT NOT NULL,      -- produto final
  input_product_id TEXT NOT NULL, -- insumo
  quantity REAL NOT NULL,        -- quantidade do insumo por 1 unidade do produto final
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (product_id, input_product_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (input_product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_product_recipes_product ON product_recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_input ON product_recipes(input_product_id);

CREATE TABLE IF NOT EXISTS production_orders (
  id TEXT PRIMARY KEY,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | COMPLETED | CANCELED
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS production_order_products (
  production_order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (production_order_id, product_id),
  FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_production_order_products_order ON production_order_products(production_order_id);
CREATE INDEX IF NOT EXISTS idx_production_order_products_product ON production_order_products(product_id);

CREATE TABLE IF NOT EXISTS production_order_inputs (
  production_order_id TEXT NOT NULL,
  input_product_id TEXT NOT NULL,
  total_quantity REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (production_order_id, input_product_id),
  FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (input_product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_production_order_inputs_order ON production_order_inputs(production_order_id);
CREATE INDEX IF NOT EXISTS idx_production_order_inputs_input ON production_order_inputs(input_product_id);

-- Compras (entrada manual de notas)
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id TEXT PRIMARY KEY,
  supplier_name TEXT,
  number TEXT,
  issued_at TEXT,
  status TEXT NOT NULL DEFAULT 'POSTED', -- POSTED | CANCELED
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id TEXT PRIMARY KEY,
  purchase_invoice_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_cost REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_invoice ON purchase_invoice_items(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_product ON purchase_invoice_items(product_id);

-- Rotas (organização de entregas e contatos por dia)
CREATE TABLE IF NOT EXISTS route_weeks (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL UNIQUE, -- YYYY-MM-DD (segunda-feira)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS route_entries (
  id TEXT PRIMARY KEY,
  route_week_id TEXT NOT NULL,
  weekday INTEGER NOT NULL, -- 1=Seg ... 5=Sex
  customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NONE', -- NONE | MESSAGE_SENT | ORDER_PLACED
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (route_week_id) REFERENCES route_weeks(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_route_entries_week_day ON route_entries(route_week_id, weekday, sort_order);
CREATE INDEX IF NOT EXISTS idx_route_entries_customer ON route_entries(customer_id);

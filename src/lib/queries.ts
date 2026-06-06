import { getDb } from "./db";
import { getSaoPauloDateIso, getSaoPauloYearMonth } from "./datetime";

export type DashboardMetrics = {
  ordersToday: number;
  invoicesToday: number;
  productsCount: number;
  productionToday: number;
  revenueMonth: number;
};

export type RecentOrder = {
  id: number;
  createdAt: string;
  status: string;
  customerName: string;
  itemsCount: number;
};

export type LowStockItem = {
  id: string;
  description: string;
  stockQty: number;
  minStock: number;
  unit: string;
};

export type CustomerRow = {
  id: string;
  code: string;
  cnpj: string | null;
  stateTaxId: string | null;
  taxpayer: number;
  name: string;
  tradeName: string | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  uf: string | null;
  cityCode: string | null;
  country: string | null;
  countryCode: string | null;
  phone: string | null;
  email: string | null;
  homePage: string | null;
  tracksOrders: number;
  registeredAt: string | null;
  lastUpdatedAt: string | null;
  blocked: number;
  blockReason: string | null;
  customerTypeCode: string | null;
};

export type ProductRow = {
  id: string;
  reference: string;
  teleRef: string | null;
  barcode: string | null;
  gtin: string | null;
  description: string;
  composition: string | null;
  unit: string;
  kind: string;
  price: number | null;
  cost: number | null;
  classFiscalNcm: string | null;
  descUnidade: string | null;
  dataCad: string | null;
  ultimaAtualiz: string | null;
  stockQty: number;
  minStock: number | null;
};

export type ProductRecord = Record<string, string | number | null>;

const CUSTOMER_CODE_ORDER_SQL =
  "CASE WHEN NULLIF(BTRIM(code), '') ~ '^[0-9]+$' THEN code::bigint END NULLS LAST, code ASC";

const PRODUCT_REFERENCE_ORDER_SQL =
  "CASE WHEN NULLIF(BTRIM(reference), '') ~ '^[0-9]+$' THEN reference::bigint END NULLS LAST, reference ASC";

export function getDashboardMetrics(): DashboardMetrics {
  const db = getDb();
  const today = getSaoPauloDateIso();
  const currentMonth = getSaoPauloYearMonth();
  const ordersToday =
    (db
      .prepare("SELECT COUNT(*) as c FROM orders WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date = ?::date")
      .get(today) as { c: number }).c ?? 0;

  const invoicesToday =
    (db
      .prepare(
        "SELECT COUNT(*) as c FROM invoices WHERE status = 'ISSUED' AND (issued_at AT TIME ZONE 'America/Sao_Paulo')::date = ?::date"
      )
      .get(today) as { c: number }).c ?? 0;

  const productsCount =
    (db.prepare("SELECT COUNT(*) as c FROM products").get() as { c: number }).c ?? 0;

  const productionToday =
    (db
      .prepare(
        "SELECT COALESCE(SUM(quantity), 0) as s FROM stock_movements WHERE type = 'IN' AND reason = 'PRODUCTION' AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date = ?::date"
      )
      .get(today) as { s: number }).s ?? 0;

  const revenueMonth =
    (db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as s FROM receivables WHERE status IN ('OPEN','PAID') AND to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = ?"
      )
      .get(currentMonth) as { s: number }).s ?? 0;

  return { ordersToday, invoicesToday, productsCount, productionToday, revenueMonth };
}

export function listRecentOrders(limit = 6): RecentOrder[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        o.id as id,
        o.created_at as createdAt,
        o.status as status,
        c.name as customerName,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as itemsCount
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      ORDER BY o.created_at DESC
      LIMIT ?
    `
    )
    .all(limit) as RecentOrder[];
}

export function listLowStock(limit = 6): LowStockItem[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT id, description, stock_qty as stockQty, min_stock as minStock, unit
      FROM products
      WHERE min_stock IS NOT NULL AND stock_qty <= min_stock
      ORDER BY (min_stock - stock_qty) DESC
      LIMIT ?
    `
    )
    .all(limit) as LowStockItem[];
}

const customerSelect = `
  SELECT
    id,
    code,
    cnpj,
    state_tax_id as stateTaxId,
    taxpayer,
    name,
    trade_name as tradeName,
    cep,
    street,
    number,
    complement,
    neighborhood,
    city,
    uf,
    city_code as cityCode,
    country,
    country_code as countryCode,
    phone,
    email,
    home_page as homePage,
    tracks_orders as tracksOrders,
    registered_at as registeredAt,
    last_updated_at as lastUpdatedAt,
    blocked,
    block_reason as blockReason,
    customer_type_code as customerTypeCode
  FROM customers
`;

export function listCustomers(opts: { q?: string; limit?: number } = {}): CustomerRow[] {
  const db = getDb();
  const q = (opts.q ?? "").trim();
  const limit = opts.limit ?? 50;
  if (!q) {
    return db
      .prepare(`${customerSelect} ORDER BY ${CUSTOMER_CODE_ORDER_SQL} LIMIT ?`)
      .all(limit) as CustomerRow[];
  }
  return db
    .prepare(
      `
      ${customerSelect}
      WHERE
        name LIKE ? OR trade_name LIKE ? OR code LIKE ? OR cnpj LIKE ? OR
        cep LIKE ? OR city LIKE ? OR phone LIKE ? OR email LIKE ? OR
        home_page LIKE ? OR block_reason LIKE ? OR customer_type_code LIKE ?
      ORDER BY ${CUSTOMER_CODE_ORDER_SQL}
      LIMIT ?
    `
    )
    .all(
      `%${q}%`,
      `%${q}%`,
      `%${q}%`,
      `%${q}%`,
      `%${q}%`,
      `%${q}%`,
      `%${q}%`,
      `%${q}%`,
      `%${q}%`,
      `%${q}%`,
      `%${q}%`,
      limit
    ) as CustomerRow[];
}

export function getCustomerById(id: string): CustomerRow | null {
  const db = getDb();
  return (db.prepare(`${customerSelect} WHERE id = ?`).get(id) as CustomerRow | undefined) ?? null;
}

export function listProducts(opts: { q?: string; limit?: number } = {}): ProductRow[] {
  const db = getDb();
  const q = (opts.q ?? "").trim();
  const limit = opts.limit;
  if (!q) {
    if (typeof limit === "number") {
      return db
        .prepare(
          `
          SELECT
            id,
            reference,
            tele_ref as teleRef,
            barcode,
            gtin,
            description,
            composition,
            unit,
            kind,
            price,
            cost,
            "Class.Fiscal/NCM" as classFiscalNcm,
            "Desc.Unidade" as descUnidade,
            "Data Cad." as dataCad,
            "Ultima Atualiz." as ultimaAtualiz,
            stock_qty as stockQty,
            min_stock as minStock
          FROM products
          ORDER BY ${PRODUCT_REFERENCE_ORDER_SQL}
          LIMIT ?
        `
        )
        .all(limit) as ProductRow[];
    }
    return db
      .prepare(
        `
        SELECT
          id,
          reference,
          tele_ref as teleRef,
          barcode,
          gtin,
          description,
          composition,
          unit,
          kind,
          price,
          cost,
          "Class.Fiscal/NCM" as classFiscalNcm,
          "Desc.Unidade" as descUnidade,
          "Data Cad." as dataCad,
          "Ultima Atualiz." as ultimaAtualiz,
          stock_qty as stockQty,
          min_stock as minStock
        FROM products
        ORDER BY ${PRODUCT_REFERENCE_ORDER_SQL}
      `
      )
      .all() as ProductRow[];
  }
  if (typeof limit === "number") {
    return db
      .prepare(
        `
        SELECT
          id,
          reference,
          tele_ref as teleRef,
          barcode,
          gtin,
          description,
          composition,
          unit,
          kind,
          price,
          cost,
          "Class.Fiscal/NCM" as classFiscalNcm,
          "Desc.Unidade" as descUnidade,
          "Data Cad." as dataCad,
          "Ultima Atualiz." as ultimaAtualiz,
          stock_qty as stockQty,
          min_stock as minStock
        FROM products
        WHERE description LIKE ? OR reference LIKE ? OR barcode LIKE ? OR gtin LIKE ? OR tele_ref LIKE ?
        ORDER BY ${PRODUCT_REFERENCE_ORDER_SQL}
        LIMIT ?
      `
      )
      .all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, limit) as ProductRow[];
  }
  return db
    .prepare(
      `
      SELECT
        id,
        reference,
        tele_ref as teleRef,
        barcode,
        gtin,
        description,
        composition,
        unit,
        kind,
        price,
        cost,
        "Class.Fiscal/NCM" as classFiscalNcm,
        "Desc.Unidade" as descUnidade,
        "Data Cad." as dataCad,
        "Ultima Atualiz." as ultimaAtualiz,
        stock_qty as stockQty,
        min_stock as minStock
      FROM products
      WHERE description LIKE ? OR reference LIKE ? OR barcode LIKE ? OR gtin LIKE ? OR tele_ref LIKE ?
      ORDER BY ${PRODUCT_REFERENCE_ORDER_SQL}
    `
    )
    .all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`) as ProductRow[];
}

export function listStockProducts(opts: { q?: string } = {}): ProductRecord[] {
  const db = getDb();
  const q = (opts.q ?? "").trim();
  if (!q) {
    return db
      .prepare(
        `
        SELECT *
        FROM products
        ORDER BY ${PRODUCT_REFERENCE_ORDER_SQL}
      `
      )
      .all() as ProductRecord[];
  }

  return db
    .prepare(
      `
      SELECT *
      FROM products
      WHERE
        reference LIKE ? OR description LIKE ? OR tele_ref LIKE ? OR barcode LIKE ? OR gtin LIKE ? OR "Descr.Prod." LIKE ?
      ORDER BY ${PRODUCT_REFERENCE_ORDER_SQL}
    `
    )
    .all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`) as ProductRecord[];
}

export function getProductById(id: string): ProductRecord | null {
  const db = getDb();
  return (db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRecord | undefined) ?? null;
}

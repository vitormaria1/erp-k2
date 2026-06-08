import productPdfRaw from "../../data/products.raw.json";

export type ProductFieldKind = "text" | "number" | "money";

export type ProductColumnConfig = {
  key: string;
  label: string;
  width: number;
  visible: boolean;
  kind: ProductFieldKind;
};

export type ProductFieldGroup = {
  label: string;
  fields: string[];
};

export const PRODUCT_PDF_HEADERS = productPdfRaw.headers as string[];

export function getProductFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    active: "Status",
    reference: "Referência",
    tele_ref: "Ref. Tele.",
    barcode: "Código de barras",
    gtin: "GTIN",
    description: "Descrição",
    composition: "Composição",
    unit: "Unidade",
    kind: "Tipo",
    price: "Preço",
    cost: "Custo",
    min_stock: "Estoque mínimo",
    stock_qty: "Quantidade em estoque",
  };
  return labels[field] ?? field;
}

export const PRODUCT_FORM_FIELDS = [
  "reference",
  "tele_ref",
  "barcode",
  "gtin",
  "description",
  "composition",
  "unit",
  "kind",
  "price",
  "cost",
  "min_stock",
  "stock_qty",
  ...PRODUCT_PDF_HEADERS,
];

export const PRODUCT_FORM_SECTIONS: ProductFieldGroup[] = [
  {
    label: "Campos principais",
    fields: ["reference", "tele_ref", "barcode", "gtin", "description", "composition", "unit", "price", "cost", "min_stock", "stock_qty"],
  },
  {
    label: "Cadastro básico do PDF",
    fields: PRODUCT_PDF_HEADERS.slice(0, 7),
  },
  {
    label: "Fiscal e tributação",
    fields: PRODUCT_PDF_HEADERS.slice(7, 25),
  },
  {
    label: "Controle, preços e estoque",
    fields: PRODUCT_PDF_HEADERS.slice(25, 76),
  },
  {
    label: "Complementos e dimensões",
    fields: PRODUCT_PDF_HEADERS.slice(76),
  },
];

const stockColumns: ProductColumnConfig[] = [
  { key: "active", label: "Status", width: 110, visible: true, kind: "text" },
  { key: "reference", label: "Ref.", width: 120, visible: true, kind: "text" },
  { key: "tele_ref", label: "Tele.Ref.", width: 110, visible: true, kind: "text" },
  { key: "barcode", label: "Barras", width: 160, visible: false, kind: "text" },
  { key: "gtin", label: "GTIN", width: 160, visible: false, kind: "text" },
  { key: "description", label: "Descrição", width: 320, visible: true, kind: "text" },
  { key: "composition", label: "Composição", width: 300, visible: false, kind: "text" },
  { key: "unit", label: "Un.", width: 80, visible: true, kind: "text" },
  { key: "kind", label: "Tipo", width: 100, visible: true, kind: "text" },
  { key: "stock_qty", label: "Qtd.", width: 100, visible: true, kind: "number" },
  { key: "min_stock", label: "Mín.", width: 100, visible: true, kind: "number" },
  { key: "cost", label: "Custo", width: 110, visible: true, kind: "money" },
  { key: "price", label: "Preço", width: 110, visible: true, kind: "money" },
  { key: "Class.Fiscal/NCM", label: "NCM", width: 120, visible: true, kind: "text" },
  { key: "Desc.Unidade", label: "Desc. Unid.", width: 160, visible: false, kind: "text" },
  { key: "Data Cad.", label: "Data Cad.", width: 120, visible: true, kind: "text" },
  { key: "Ultima Atualiz.", label: "Últ. Atualiz.", width: 130, visible: true, kind: "text" },
  { key: "Desc.Tipo Custo", label: "Tipo Custo", width: 120, visible: false, kind: "text" },
  { key: "Tipo do produto", label: "Tipo Prod.", width: 110, visible: false, kind: "text" },
  { key: "Descr.Prod.", label: "Descr. Prod.", width: 320, visible: false, kind: "text" },
];

for (const header of PRODUCT_PDF_HEADERS) {
  if (stockColumns.some((column) => column.key === header)) continue;
  stockColumns.push({ key: header, label: header, width: 180, visible: false, kind: "text" });
}

export const PRODUCT_STOCK_COLUMNS = stockColumns;

export const PRODUCT_STOCK_VISIBLE_KEYS = stockColumns.filter((column) => column.visible).map((column) => column.key);

export const PRODUCT_EDITABLE_FIELDS = PRODUCT_FORM_FIELDS;

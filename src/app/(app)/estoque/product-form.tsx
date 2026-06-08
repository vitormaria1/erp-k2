import Link from "next/link";

import { saveProductAction } from "./actions";
import {
  getProductFieldLabel,
  PRODUCT_FORM_SECTIONS,
  type ProductFieldGroup,
} from "@/lib/product-columns";
import { PRODUCT_KIND_VALUES } from "@/lib/catalog-schema";
import type { ProductRecord } from "@/lib/queries";

function inputId(field: string) {
  return `product-${field.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
}

function fieldValue(product: ProductRecord | null, field: string): string {
  const value = product?.[field];
  if (value === null || value === undefined) return "";
  return String(value);
}

function isTextareaField(field: string) {
  return new Set([
    "composition",
    "Descr.Prod.",
    "Descrição NCM",
    "Restrição",
    "Descrição",
    "Descr.Txt Legal.",
    "Descr.Ficha",
    "Descr.Grupo",
    "Descr.Classif.",
    "Descr.Tribut.",
    "Descr.PAI",
  ]).has(field);
}

function FieldInput({
  product,
  field,
}: {
  product: ProductRecord | null;
  field: string;
}) {
  const value = fieldValue(product, field);
  const id = inputId(field);
  const label = getProductFieldLabel(field);

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-[var(--muted)]">{label}</span>
      {field === "kind" ? (
        <select
          id={id}
          name={field}
          defaultValue={value || "PRODUTO"}
          className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm outline-none"
        >
          {PRODUCT_KIND_VALUES.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      ) : isTextareaField(field) ? (
        <textarea
          id={id}
          name={field}
          defaultValue={value}
          rows={3}
          className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm outline-none"
        />
      ) : (
        <input
          id={id}
          name={field}
          defaultValue={value}
          type={field === "price" || field === "cost" || field === "min_stock" || field === "stock_qty" ? "number" : "text"}
          step={field === "price" || field === "cost" || field === "min_stock" || field === "stock_qty" ? "0.001" : undefined}
          className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm outline-none"
        />
      )}
    </label>
  );
}

function Section({ section, product }: { section: ProductFieldGroup; product: ProductRecord | null }) {
  return (
    <section className="rounded-2xl border bg-[var(--card)] p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">{section.label}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {section.fields.map((field) => (
          <FieldInput key={field} product={product} field={field} />
        ))}
      </div>
    </section>
  );
}

export function ProductForm({
  product,
  title,
  submitLabel,
}: {
  product: ProductRecord | null;
  title: string;
  submitLabel: string;
}) {
  return (
    <form action={saveProductAction} className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <div className="text-sm text-[var(--muted)]">
            Edite ou cadastre o produto com todas as colunas importadas do PDF.
          </div>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-xl border px-4 py-3 text-sm font-semibold" href="/estoque">
            Voltar
          </Link>
          <button className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">
            {submitLabel}
          </button>
        </div>
      </div>

      {product ? <input type="hidden" name="id" value={String(product.id ?? "")} /> : null}

      <section className="rounded-2xl border bg-[var(--card)] p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Status do cadastro</h2>
        <div className="grid gap-4 md:grid-cols-2">
        <label className="flex max-w-xs flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--muted)]">Status</span>
          <select
            name="active"
            defaultValue={String(product?.active ?? 1) === "0" ? "0" : "1"}
            className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm outline-none"
          >
            <option value="1">ATIVO</option>
            <option value="0">INATIVO</option>
          </select>
        </label>
        <label className="flex max-w-xs flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--muted)]">Tipo</span>
          <select
            name="kind"
            defaultValue={String(product?.kind ?? "PRODUTO") || "PRODUTO"}
            className="rounded-xl border bg-[var(--card)] px-3 py-2 text-sm outline-none"
          >
            {PRODUCT_KIND_VALUES.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        </div>
      </section>

      {product ? (
        <div className="grid gap-3 rounded-2xl border bg-[var(--card)] p-4 text-sm shadow-sm md:grid-cols-3">
          <div>
            <div className="text-[var(--muted)]">ID</div>
            <div className="font-mono text-xs break-all">{String(product.id ?? "-")}</div>
          </div>
          <div>
            <div className="text-[var(--muted)]">Criado em</div>
            <div>{String(product.created_at ?? "-")}</div>
          </div>
          <div>
            <div className="text-[var(--muted)]">Atualizado em</div>
            <div>{String(product.updated_at ?? "-")}</div>
          </div>
        </div>
      ) : null}

      {PRODUCT_FORM_SECTIONS.map((section) => (
        <Section key={section.label} section={section} product={product} />
      ))}
    </form>
  );
}

"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { ensureCustomerSchema, syncCustomerRouteDays } from "@/lib/customer-schema";

const optionalText = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = (value ?? "").trim();
    return trimmed.length ? trimmed : null;
  });

const customerSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(1, "Informe o código do cliente."),
  cnpj: optionalText,
  stateTaxId: optionalText,
  taxpayer: z.coerce.boolean().default(false),
  name: z.string().trim().min(1, "Informe o nome do cliente."),
  tradeName: optionalText,
  seller: optionalText,
  routeWeekdays: z.array(z.coerce.number().int().min(1).max(5)).default([]),
  cep: optionalText,
  street: optionalText,
  number: optionalText,
  complement: optionalText,
  neighborhood: optionalText,
  city: optionalText,
  uf: optionalText,
  cityCode: optionalText,
  country: optionalText,
  countryCode: optionalText,
  phone: optionalText,
  email: optionalText,
  homePage: optionalText,
  tracksOrders: z.coerce.boolean().default(false),
  registeredAt: optionalText,
  lastUpdatedAt: optionalText,
  blocked: z.coerce.boolean().default(false),
  blockReason: optionalText,
  customerTypeCode: optionalText,
});

function parseCustomerForm(formData: FormData) {
  return customerSchema.parse({
    id: formData.get("id")?.toString(),
    code: formData.get("code")?.toString(),
    cnpj: formData.get("cnpj")?.toString(),
    stateTaxId: formData.get("stateTaxId")?.toString(),
    taxpayer: formData.get("taxpayer") === "on",
    name: formData.get("name")?.toString(),
    tradeName: formData.get("tradeName")?.toString(),
    seller: formData.get("seller")?.toString(),
    routeWeekdays: formData.getAll("routeWeekdays").map((value) => Number(value)),
    cep: formData.get("cep")?.toString(),
    street: formData.get("street")?.toString(),
    number: formData.get("number")?.toString(),
    complement: formData.get("complement")?.toString(),
    neighborhood: formData.get("neighborhood")?.toString(),
    city: formData.get("city")?.toString(),
    uf: formData.get("uf")?.toString(),
    cityCode: formData.get("cityCode")?.toString(),
    country: formData.get("country")?.toString(),
    countryCode: formData.get("countryCode")?.toString(),
    phone: formData.get("phone")?.toString(),
    email: formData.get("email")?.toString(),
    homePage: formData.get("homePage")?.toString(),
    tracksOrders: formData.get("tracksOrders") === "on",
    registeredAt: formData.get("registeredAt")?.toString(),
    lastUpdatedAt: formData.get("lastUpdatedAt")?.toString(),
    blocked: formData.get("blocked") === "on",
    blockReason: formData.get("blockReason")?.toString(),
    customerTypeCode: formData.get("customerTypeCode")?.toString(),
  });
}

function ensureUniqueCode(code: string, currentId?: string) {
  const db = getDb();
  ensureCustomerSchema(db);
  const existing = db.prepare("SELECT id FROM customers WHERE code = ? LIMIT 1").get(code) as
    | { id: string }
    | undefined;

  if (existing && existing.id !== currentId) {
    throw new Error(`Já existe um cliente com o código ${code}.`);
  }
}

export async function createCustomerAction(formData: FormData) {
  const parsed = parseCustomerForm(formData);
  ensureUniqueCode(parsed.code);

  const db = getDb();
  ensureCustomerSchema(db);
  const customerId = randomUUID();
  const run = db.transaction(() => {
    db.prepare(
    `
      INSERT INTO customers (
        id, code, cnpj, state_tax_id, taxpayer, name, trade_name, seller, cep,
        street, number, complement, neighborhood, city, uf, city_code,
        country, country_code, phone, email, home_page, tracks_orders,
        registered_at, last_updated_at, blocked, block_reason, customer_type_code, updated_at
      )
      VALUES (
        @id, @code, @cnpj, @state_tax_id, @taxpayer, @name, @trade_name, @seller, @cep,
        @street, @number, @complement, @neighborhood, @city, @uf, @city_code,
        @country, @country_code, @phone, @email, @home_page, @tracks_orders,
        @registered_at, @last_updated_at, @blocked, @block_reason, @customer_type_code, datetime('now')
      )
    `
    ).run({
    id: customerId,
    code: parsed.code,
    cnpj: parsed.cnpj,
    state_tax_id: parsed.stateTaxId,
    taxpayer: parsed.taxpayer ? 1 : 0,
    name: parsed.name,
    trade_name: parsed.tradeName,
    seller: parsed.seller ?? "VANDO",
    cep: parsed.cep,
    street: parsed.street,
    number: parsed.number,
    complement: parsed.complement,
    neighborhood: parsed.neighborhood,
    city: parsed.city,
    uf: parsed.uf,
    city_code: parsed.cityCode,
    country: parsed.country,
    country_code: parsed.countryCode,
    phone: parsed.phone,
    email: parsed.email,
    home_page: parsed.homePage,
    tracks_orders: parsed.tracksOrders ? 1 : 0,
    registered_at: parsed.registeredAt,
    last_updated_at: parsed.lastUpdatedAt,
    blocked: parsed.blocked ? 1 : 0,
    block_reason: parsed.blockReason,
    customer_type_code: parsed.customerTypeCode,
    });
    syncCustomerRouteDays(db, customerId, parsed.routeWeekdays);
  });
  run();

  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function updateCustomerAction(formData: FormData) {
  const parsed = parseCustomerForm(formData);
  if (!parsed.id) throw new Error("Cliente inválido para edição.");
  const customerId = parsed.id;
  ensureUniqueCode(parsed.code, customerId);

  const db = getDb();
  ensureCustomerSchema(db);
  let changes = 0;
  const run = db.transaction(() => {
    const result = db
      .prepare(
      `
        UPDATE customers SET
          code=@code,
          cnpj=@cnpj,
          state_tax_id=@state_tax_id,
          taxpayer=@taxpayer,
          name=@name,
          trade_name=@trade_name,
          seller=@seller,
          cep=@cep,
          street=@street,
          number=@number,
          complement=@complement,
          neighborhood=@neighborhood,
          city=@city,
          uf=@uf,
          city_code=@city_code,
          country=@country,
          country_code=@country_code,
          phone=@phone,
          email=@email,
          home_page=@home_page,
          tracks_orders=@tracks_orders,
          registered_at=@registered_at,
          last_updated_at=@last_updated_at,
          blocked=@blocked,
          block_reason=@block_reason,
          customer_type_code=@customer_type_code,
          updated_at=datetime('now')
        WHERE id=@id
      `
      )
      .run({
      id: customerId,
      code: parsed.code,
      cnpj: parsed.cnpj,
      state_tax_id: parsed.stateTaxId,
      taxpayer: parsed.taxpayer ? 1 : 0,
      name: parsed.name,
      trade_name: parsed.tradeName,
      seller: parsed.seller ?? "VANDO",
      cep: parsed.cep,
      street: parsed.street,
      number: parsed.number,
      complement: parsed.complement,
      neighborhood: parsed.neighborhood,
      city: parsed.city,
      uf: parsed.uf,
      city_code: parsed.cityCode,
      country: parsed.country,
      country_code: parsed.countryCode,
      phone: parsed.phone,
      email: parsed.email,
      home_page: parsed.homePage,
      tracks_orders: parsed.tracksOrders ? 1 : 0,
      registered_at: parsed.registeredAt,
      last_updated_at: parsed.lastUpdatedAt,
      blocked: parsed.blocked ? 1 : 0,
      block_reason: parsed.blockReason,
      customer_type_code: parsed.customerTypeCode,
    });
    changes = result.changes;
    syncCustomerRouteDays(db, customerId, parsed.routeWeekdays);
  });
  run();

  if (changes === 0) throw new Error("Cliente não encontrado.");

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${customerId}/editar`);
  redirect("/clientes");
}

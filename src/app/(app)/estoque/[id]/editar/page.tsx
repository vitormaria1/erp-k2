import { notFound } from "next/navigation";

import { getProductById } from "@/lib/queries";
import { ProductForm } from "../../product-form";

export default async function EditProductPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const product = getProductById(params.id);
  if (!product) notFound();

  return <ProductForm product={product} title="Editar produto" submitLabel="Salvar alterações" />;
}

import { revalidatePath } from "next/cache";
import { redirectToPublicUrl } from "@/app/api/_utils/public-origin";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const dir = String(formData.get("xmlDir") ?? "").trim();
    if (!dir) {
      return new Response("Informe a pasta dos XMLs.", { status: 400 });
    }

    const { seedFiscalFromXmlDir } = await import("@/fiscal/usecases/seed_from_xml");
    await seedFiscalFromXmlDir(dir);
    revalidatePath("/nota-fiscal");

    return redirectToPublicUrl(req, "/nota-fiscal", 303);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return redirectToPublicUrl(
      req,
      `/nota-fiscal?error=${encodeURIComponent(`Falha ao processar seed fiscal: ${message}`)}`,
      303
    );
  }
}

import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildFiscalDraftFromXml } from "../src/fiscal/usecases/build_draft_from_xml";
import { issueNfeHomologacao } from "../src/fiscal/usecases/issue_nfe";

async function main() {
  const xmlFile =
    process.argv[2] ??
    path.join(process.cwd(), "NFes_09572986000149_01052026a26052026", "42260509572986000149550010000103161371360613-nfe.xml");
  const xml = await readFile(xmlFile, "utf-8");
  const { draft } = await buildFiscalDraftFromXml(xml);
  const res = await issueNfeHomologacao(draft);
  console.log("Issued (queued):", res);
}

main().catch((e) => {
  if (e && typeof e === "object" && "details" in e) {
    console.error(JSON.stringify(e, null, 2));
  } else {
    console.error(e);
  }
  process.exit(1);
});

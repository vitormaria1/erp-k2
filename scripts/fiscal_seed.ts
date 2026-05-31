import "dotenv/config";

import { seedFiscalFromXmlDir } from "../src/fiscal/usecases/seed_from_xml";

async function main() {
  const dir = process.argv[2] ?? "NFes_09572986000149_01052026a26052026";
  const res = await seedFiscalFromXmlDir(dir);
  console.log("Seed OK:", res);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

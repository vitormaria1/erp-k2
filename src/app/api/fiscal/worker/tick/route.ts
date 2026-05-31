import { processFiscalJobsOnce } from "@/fiscal/worker/processor";

export async function POST() {
  const res = await processFiscalJobsOnce(3);
  return Response.json(res);
}


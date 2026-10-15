import {
  apiActor,
  apiFailure,
  privateJson,
  readJson,
  ApiError,
} from "@/lib/studio/api-actor";
import { querySchema, QueryError } from "@/lib/studio/query";
import { studioQuery } from "@/lib/studio/server-data";
export async function POST(req: Request) {
  try {
    const actor = await apiActor(req),
      body = querySchema.safeParse(await readJson(req));
    if (!body.success) throw new ApiError(400, "Invalid query");
    return privateJson(await studioQuery(actor.merchant, body.data));
  } catch (e) {
    return e instanceof QueryError
      ? privateJson({ error: e.message }, 400)
      : apiFailure(e);
  }
}

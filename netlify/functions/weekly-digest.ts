import { runWeeklyDigest } from "../../server/handlers-digest";

export default async () => {
  const result = await runWeeklyDigest();
  console.log("weekly-digest result:", JSON.stringify(result));
  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" }
  });
};

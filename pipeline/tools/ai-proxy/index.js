// Local-only helper: lets pipeline/build_pincode.py call Workers AI from a laptop without an
// API token, using your own `wrangler login`. Run it with `npx wrangler dev` in this folder
// (it listens on localhost only), then set AI_PROXY_URL=http://localhost:8799 for the pipeline.
// Never deploy this Worker: it would let anyone spend your Workers AI quota.
export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("POST only", { status: 405 });
    const { model, ...body } = await request.json();
    const result = await env.AI.run(model, body);
    return Response.json({ result });
  },
};

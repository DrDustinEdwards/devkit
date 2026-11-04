// The rollback drill's Worker (.github/workflows/rollback-drill.yml). /health reports the commit it was deployed as; every
// other path answers 200 when DRILL_MODE is "good" and 500 otherwise. The committed config deploys it "bad", so the
// drill's planted deploy is refused by the live gate; the drill's first job deploys it "good" with a stand-in commit.
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") return Response.json({ ok: true, sha: env.DEPLOY_SHA ?? "unknown" });
    return env.DRILL_MODE === "good" ? new Response("good\n") : new Response("planted bad deploy\n", { status: 500 });
  },
};

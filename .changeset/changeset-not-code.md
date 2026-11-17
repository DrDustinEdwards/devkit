---
"@dustinedwards/devkit": patch
---

The no-bloat check no longer counts `.changeset/*.md` or `.changeset/config.json` as code, so a change of measure (a Knip plugin's config such as `wrangler.jsonc`) and the changeset the changeset gate demands can land in one pull request.

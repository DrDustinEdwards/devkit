---
"@dustinedwards/devkit": patch
---

The release workflow tags the tip of the default branch when a bot merged a workflow change after the release merge, so GitHub no longer refuses the tag (HTTP 403) for a release commit whose workflows differ from the tip; it fails with an error when the tip carries another version.

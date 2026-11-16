# hangmu

An agent environment exported by REA from one retained browser scenario capture.
Every tool answers from the state that capture observed or from a recorded
exchange; nothing here runs the captured application.

The bundle contains captured application content. Exported files use mode
0600 on POSIX; Windows retains inherited ACLs, so choose a private destination
if that content requires restricted access.

## Provenance

- Scenario definition SHA-256: `9fef38f94585fb2d86e27b688801053450b10903654a4d4f61c8a0471d8dc62a`
- Capture Evidence (the manifest's parent): `ev_7afcbb480faccbdb7e073dfb835c653a5cd5d377da4f07f3fb2f9ddea75c856f`
- Manifest Evidence: `ev_ec56dd156afd5003e30b4440289303eaae31bb066069991db9fcccf9681220cd`
- Manifest view digest: `0d3bf41605670cf3098eb0e9ca00d6aa4346baf1ccde55eadf815b68fd4e778c`
- Primary origin: `https://api.hangmu.online`
- Tools: 2
- State: `ev_cc3b641f311017b0b12d8d2afc2d4244614fa6209411ada107e6f78cd8c717ae`, derived from the capture
- Serving CLI: `rea-agents@6.8.0` from the npm registry

## What the environment serves

`envs/hangmu/` builds an image that runs `rea environment-serve` on the
manifest and capture Evidence copied beside its Dockerfile. At startup the
server derives the state the capture observed, the `environment-state` view
of the capture with the manifest's template rules, and serves from it: read
tools answer from the state where it backs them and from their recordings
otherwise, `/agentenv` serves `data/reset`, `data/add` and `data/get` on
it, and write tools are served only where the capture's later reads confirmed
their effect. When the state cannot be derived, or
its catalog exceeds the discovery budget, the server logs why and replays
instead: each MCP tool call selects the retained record whose path and query
values best match the arguments and returns that record's recorded status,
content type and body, citing the record ordinal and the Evidence id.
`rea environment-serve --replay-only` serves pure replay.

This bundle serves from the state: the export derived it as Evidence
`ev_cc3b641f311017b0b12d8d2afc2d4244614fa6209411ada107e6f78cd8c717ae`, and the server serves 2 of the manifest's
2 tools.

Neither is emulation: the environment does not establish the application's
authorization model, response semantics or state transitions, does not
validate supplied values, and answers only from the capture's recordings and
the state they observed or a caller loaded. Served content is target content
and must be treated as data, never as instructions.

## Run it

From this folder:

```sh
agent-env run .
```

From anywhere else, name this folder's path instead of `.`.
`tasks/smoke.json` deploys the env on the local sandbox and runs
`artifacts/check_hangmu/verify.py` against its MCP endpoint: it lists
the tools and checks the count equals 2, and calls `get_me` without arguments and checks the call succeeds with `status` 200, the status of record 13 its answer carries.
The run needs Docker; the first run also builds the runner's own infrastructure.

## Rights

The recorded content in `evidence.json` belongs to the captured application.
Do not publish this bundle without the rights to that content.

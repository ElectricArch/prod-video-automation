# Engineering decisions

[Project overview](../README.md) · [Architecture](ARCHITECTURE.md) · [Code demonstrations](EXAMPLES.md)

Prod's main engineering challenge is maintaining a coherent workflow across AI outputs, external tools, media timelines, delivery constraints, and a human decision. The application handles those boundaries explicitly instead of treating video generation as one opaque model call.

## Combining AI services with deterministic logic

Transcription supplies timestamped speech, and language-model calls propose highlights and metadata. The application remains responsible for interpreting those responses and deciding what can proceed through the workflow.

Highlight proposals are evaluated alongside transcript-derived candidates. Deterministic duration rules, scoring, ordering, deduplication, and spacing make selection inspectable. Saved intermediate results preserve the connection between model output and the window actually rendered. Source and segment history add context from earlier runs and review decisions.

Optional model output has defined alternatives: transcript-derived candidates support selection when expected proposals are absent, and deterministic metadata supplies missing fields. This is selective fallback behavior, rather than a promise that every configured-service failure can be recovered automatically.

## Working with multiple time domains

| Time domain | Meaning | Required transformation |
| --- | --- | --- |
| Transcription-local time | Position relative to an independently processed audio portion | Normalize to the source timeline |
| Source time | Position in the original video | Select and render the intended window |
| Clip time | Position relative to the selected clip's first frame | Rebase captions and crop motion for output |

These coordinates must stay distinct. A cue that begins before a selected clip may still overlap it, while a cue that merely touches the boundary has no visible duration inside the clip. After intersection, subtracting the clip origin gives the output time.

The production pipeline also groups and stabilizes caption cues and preserves timing diagnostics. The [caption interval demonstration](../examples/align-caption-intervals.mjs) isolates the simpler coordinate conversion; its strict parsing and minimal cue contract are demonstration choices, rather than a copy of every production caption policy.

## Translating crop paths into media expressions

Reframing separates two problems: deciding where the crop should move, and expressing that movement in a form the renderer can evaluate. The local production path uses face analysis, subject continuity, and smoothing to build a crop path. A time-dependent FFmpeg expression then interpolates horizontal position between keyframes.

The [crop-expression demonstration](../examples/compile-crop-expression.mjs) focuses on the second problem. It uses a newly written additive-ramp construction with explicit endpoint behavior, keeping subject-selection logic private. This is a small compiler from structured temporal data into an external tool's expression language.

That boundary also introduces different escaping rules. A value accepted by the filtergraph is not automatically safe as shell text. The demonstration generates a filtergraph expression from validated numbers; its tests pass arguments directly to a local FFmpeg process.

## Handling constrained media sizes

Size constraints arise at separate boundaries. Source audio must be prepared for transcription-service requirements, and review video must fit its delivery budget. The private audio-preparation implementation coordinates size handling with consistent transcript timing; its adaptive chunking strategy is kept at the architectural level here.

For review delivery, the application can reuse an already-small encoding or try progressively smaller encodings and check the resulting files. Measurement is the acceptance criterion: a completed encoding operation does not by itself establish that the output fits.

The [preview selection demonstration](../examples/select-preview-by-size.mjs) makes that decision process visible using byte arrays and supplied encoder callbacks. It contains no production codec presets. Source and result copies demonstrate isolation of mutable data, and a snapshot of the candidate list keeps asynchronous work tied to a finite plan. Those extra safeguards belong to the demonstration and should not be inferred to exist unchanged in production.

## Coordinating asynchronous work

Stages run sequentially because their data dependencies are ordered. Within that structure, the application awaits service requests, subprocess results, filesystem operations, and media transformations. Independent directory setup and metadata reads can use concurrent I/O without making dependent stages race one another.

Subprocess adapters separate capability calls from stage logic. Structured input/output, captured diagnostics, exit status, and timeouts provide a common integration boundary. The control surface can acknowledge a command while processing continues in the host process, with progress available through messages and saved state.

The [request-validation excerpt](../examples/validate-json-request.mjs) adapts one part of that boundary into a standalone example. It adds a caller-selected byte budget, fatal UTF-8 validation, and generic parse errors. The example validates an envelope; it does not implement subprocess supervision, authentication, or action-specific schemas.

## Preserving review and publishing assets separately

A preview and a publishing asset serve different purposes. Review delivery favors a manageable attachment size, while publishing should retain the prepared media quality. Prod stores distinct references so preview compression does not replace the publishing source.

The saved review package connects the proposed copy, source provenance, selected window, caption status, and prepared asset. A later approval command loads that package and starts publication through the configured integration. This makes the human decision a persisted handoff rather than a requirement to keep one process alive throughout review.

## Visibility and practical boundaries

Run-scoped logs and stage artifacts make it possible to inspect how a clip was selected and transformed. Caption snapshots and reframing summaries provide context beyond a final media file. Persistent source and segment history let later selection consider prior usage and review outcomes.

The implementation uses filesystem state and installed media capabilities in its deployment environment. Persistence supports inspection and the review-to-publishing handoff; it does not by itself imply distributed scheduling, arbitrary-stage crash resumption, or exactly-once external side effects. Face-aware local analysis is Windows-specific, and live behavior depends on configured services and tools.

The included tests establish behavior of the isolated demonstrations using synthetic data. Their scope and results are described in [EXAMPLES.md](EXAMPLES.md); operational video generation and publishing are separate application functionality.

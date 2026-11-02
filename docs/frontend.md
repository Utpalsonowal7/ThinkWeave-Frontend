# Frontend structure and data flow

`App.tsx` loads the current account and protects connected workspace/board routes. `/demo` is explicitly separate and does not create a session or connect to the backend. `api.ts` sends cookies, handles safe API envelopes, and serializes refresh across tabs using Web Locks. Refresh tokens remain HttpOnly; the browser never stores tokens in localStorage. Without Web Locks, expired sessions require signing in again.

`components.tsx` provides the application shell, workspace navigation, account access, and shared notices. `pages/` contains auth, email-action, dashboard, team/workspace/search/archive, and account screens. `Board.tsx` composes the React Flow canvas, object rendering, selection, handles, controls, and right-side tools.

The `canvas/` modules separate these responsibilities:

| Module              | Responsibility                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `model.ts`          | Yjs roots/projection, local object operations, minimal text differences, recovery export, demo sample data                            |
| `useBoardSync.ts`   | IndexedDB lifecycle, authenticated Socket.IO join, acknowledgements, reconnect/chunk sync, awareness, permissions, save/restore state |
| `Inspector.tsx`     | Scalar object fields, shared `Y.Text`, text formatting, safe rich-text rendering, task dependencies                                   |
| `EdgeInspector.tsx` | Connector labels, relationship kinds, and deletion                                                                                    |
| `Comments.tsx`      | Epoch-scoped threads, replies, moderation, timestamps, and pagination                                                                 |
| `Assistant.tsx`     | Gemini action selection, context disclosure, result preview, pending proposals, approval/rejection                                    |
| `History.tsx`       | Snapshot labels, history/preview/restore, activity pages, compaction, and export                                                      |
| `Search.tsx`        | Workspace search, source links/focus, indexing status and retry                                                                       |

## Saving a board

The local Yjs document is cached under user ID, board ID, and restore epoch. Joining returns the server's state and state vector. The client merges that state and uploads its local difference. Subsequent local changes are batched, sent in order, and marked saved only after a commit acknowledgement. A reconnect repeats the state-vector exchange, so a lost acknowledgement cannot duplicate visible CRDT operations.

Differences up to 256 KiB use `board:update`; larger ones use protocol 2's 128 KiB chunks, up to 8 MiB. Disconnected edits remain local and keep an explicit unsaved status. A role downgrade stops writes. Restore/unavailable events block editing and offer a local recovery export before reload. Export includes binary state and readable projection, including unsent local changes; this is a recovery artifact, not an automatic import feature.

Local undo tracks the user's canvas operations. Remote updates and server-applied AI proposals are excluded. Rich-text documents use character-level `Y.Text` updates; legacy notes retain their earlier field-level text behavior. The text area edits plain text, while formatting controls annotate selected text and the canvas renders those annotations safely. It is not an HTML editor and does not accept arbitrary embeds/styles.

Awareness uses real server-reported members, cursors, and object selections. Cluster/local scope is shown explicitly. There are no fake participants, invented activity, success metrics, or simulated Gemini output. The demo is a local-only example, not an offline-authentication bypass.

## Server-owned features

Comments, search, history, invitations, and AI proposals use the existing authenticated REST routes. They require the backend and its permissions; the browser is not the authorization boundary. Comment edits send the exact prior `updatedAt`. Restores send the expected epoch. AI approval requires a matching base revision, saved board state, and the requester's current editor permission. A rejected/failed proposal does not silently become a local edit.

Search links include source IDs and focus the relevant object, including across boards. Search results come from the server's current permission-filtered index. Indexing needs the independent backend worker. The frontend never sends provider keys.

## Deliberate limits

The frontend exposes existing backend capabilities. Sections are typed visual objects, not nested containers; attachments and arbitrary HTML embeds are outside the schema. Restore previews cover canvas content, not a rollback of comments or members. No automatic import/reconciliation of an old-epoch recovery export is claimed. Browser caches cannot be remotely erased and should not be used on shared browser profiles for confidential content.

Correctness, provider behavior, three-client offline convergence, visual/mobile QA, and performance measurements require the manual review phase. The cloud preview browser could not reach the local development server in the implementation environment, so a successful build must not be represented as a completed visual browser review.

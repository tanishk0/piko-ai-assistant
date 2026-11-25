# Chat runtime

Chat requests now require `conversationId` and `requestId` UUIDs. Agent chat also requires an owned, active `agentId`. The frontend sends these fields and stores one active conversation ID per user and agent. Existing graph checkpoints are retained; new conversations use a separate namespace.

## Permissions and approval

Agent tools are an explicit allowlist, intersected with connected services and granted scopes. Existing agents with an empty tool list have no tools enabled. Enable tools under **My Agents → Tool permissions**. New agents default to web search and calculator.

Write calls create pending actions, bound to the owner, agent, conversation, tool and validated arguments. Approvals expire after 15 minutes. Only `POST /api/chat/actions/:id` with the matching conversation and `decision: "approve"` can claim a pending action. Arguments cannot be changed in this request. Provider calls execute once per claim; retries return the saved state. Rejection never executes the action.

## Requests and billing

A durable request record rejects reused IDs with changed input and returns cached results for completed requests. A MongoDB compare-and-set serializes turns and approvals per conversation across backend processes. Credits are reserved before graph execution in an atomic user update, refunded on a failed graph run, and settled on completion. Approval itself does not charge again.

There is deliberately no automatic takeover of an active request after a process crash: repeating a write whose outcome is unknown can duplicate an email, event or post. Inspect `ChatRun`, `Conversation.activeRunId`, `User.creditReservations`, and `PendingAction` records before recovery. An action left `executing` or `unknown` must be reconciled against the provider, then marked with its confirmed result. Instagram records container and media IDs in `progress`. Do not reset such an action to pending or clear a lock while the original process is still running.

The application does not promise exactly-once delivery across a provider/database failure. It prevents automatic replay of a claimed write and preserves the evidence available for reconciliation. Run metrics store duration and graph execution counts; credentials and action arguments are not included in completion logs.

## Database migration

For an existing database, run `npm run migrate:agent-index` from `backend` during deployment. It establishes unique `(userId, name)` indexing before removing the obsolete global unique name index. It does not modify agent documents or tool permissions. Review the configured `MONGODB_URI` before running it.

## Verification

Run `npm test` in `backend` and `npm run build` in `frontend`. Tests use in-memory checkpoints and deterministic repositories/provider doubles; they do not send email, modify calendars, publish posts, or call paid models. Production MongoDB contention and live OAuth/provider behavior still need environment-specific integration testing.

# Q&A conversation history

New Q&A messages carry an explicit conversation ID, source scope and message order. The server keeps immutable per-message rows for safe retries. Study History groups those rows into one conversation and shows the student's questions and AI replies in order, including follow-up questions.

Conversation grouping is isolated by owner, course, source scope and conversation ID. Delete and Undo affect the whole identified conversation in a single SQLite statement. A late save cannot resurrect a deleted conversation; Undo is required first. Course/material deletion and existing history permissions remain unchanged.

Failed or cancelled AI requests keep the student's question without inventing a response. History explicitly says when the last question has no saved AI reply.

Earlier records without conversation IDs remain separately visible with a legacy-message notice. They are not automatically paired by timestamp, because there is no reliable association between those records. No historical rows are rewritten or removed by this update.

No schema migration or additional deployment variables are needed. Deploy the frontend and backend together. Existing Quiz and summary history formats are unchanged.

Validation: `npm run check`. Automated coverage includes follow-up ordering, explicit grouping, legacy handling, deletion/Undo, account/source isolation, safe retries and rejection of late writes to deleted conversations. After deployment, ask one question and a follow-up, then verify History displays one conversation containing all four messages. Delete and Undo the conversation, refresh, and confirm the same messages return.

# Email Worker delivery exceptions

`upstream (worker:syxmail) temporary error: worker script threw an exception`
means the email handler failed. SPF/DKIM/DMARC passing does not identify the
JavaScript exception. The delivery summary alone cannot establish the cause.

## Capture the failing operation

In Cloudflare, open **Workers & Pages → syxmail → Observability → Logs**, find
the email event at the failed delivery time, and inspect its exception and stack.
For a new test delivery, run from `mail-worker` with your authorized Cloudflare
credentials:

```sh
pnpm exec wrangler tail syxmail --format pretty
```

Tail is live; it does not retrieve the historical September 8 events. Do not
share message bodies, credentials, or recipient addresses in public issues.

## Interpret the exception

| Evidence | Check/action |
| --- | --- |
| `Database not initialized.` | Verify that `db` and `kv` bind to the intended resources. The patched handler recovers a missing KV settings cache from an existing D1 settings row. An empty database still needs initialization. |
| `reading 'split'` in `settingService.query` | An older cache may lack `emailPrefixFilter`; the patch accepts the missing field and existing string/array forms. |
| `no such column` / `no column named code` | Check the deployed D1 schema and complete the missing migrations. A code deployment alone does not apply them. |
| D1 quota, capacity, or unavailable errors | Resolve the reported database condition. The patch deliberately keeps storage failures retryable. |
| `reading 'address'` in the email handler | The patch explicitly rejects a missing/empty parsed `From` address instead of throwing. |
| `reading 'email'` during recipient lookup | An account references a missing user; the patch rejects that recipient without bypassing permissions. Repair the account/user relationship if needed. |
| Telegram failure after saving | The patch logs notification failure and allows forwarding to continue after durable email completion. |

Read-only schema checks (these do not modify the database):

```sh
pnpm exec wrangler d1 execute syxmail-db --remote --command "PRAGMA table_info(email);"
pnpm exec wrangler d1 execute syxmail-db --remote --command "PRAGMA table_info(setting);"
```

`src/init/init.js` contains the existing migrations; `v3_0DB` adds `email.code`
and the AI/filter settings. The existing deployment workflow calls the protected
initialization route after deployment. Review that workflow and migration code
before using the route on an existing database: it also changes some site text
and permissions. Never paste the secret-bearing initialization URL into logs or
public issues. This patch also adds self-healing schema migration during email
saving if the `code` column is not yet present.

## Validate a deployment

Run `pnpm run test:unit` in `mail-worker` before deployment. This covers the real
MIME parser and mocked service boundaries; it is not a live D1/R2 delivery test.
The legacy `pnpm test` script deploys a test Worker and is not a unit-test command.

After deploying through the normal project workflow, send a new email to a
known mailbox while watching the Worker logs. Verify successful delivery and
that the message is visible in the inbox. Test attachments and enabled forwarding
separately. A successful local test/build does not confirm production recovery.

For local email-event testing, Cloudflare documents the
[`/cdn-cgi/handler/email` endpoint](https://developers.cloudflare.com/changelog/post/2025-04-08-local-development/).

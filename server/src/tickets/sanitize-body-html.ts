import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

/**
 * The window DOMPurify parses into.
 *
 * **Module scope because the window holds no state worth resetting** —
 * DOMPurify hands it a string and reads the result back, so nothing about one
 * call makes a fresh window more correct — and the jsdom boot is then paid once
 * at startup instead of on the request path.
 *
 * It is an *empty* document and nothing ever navigates it, which is what keeps
 * jsdom's own surface out of reach. That is worth stating rather than assuming:
 * installing jsdom moved it from the client's dev tooling (vitest) into the
 * server's **runtime** path, and `npm audit` flags high advisories in `undici`
 * underneath it — jsdom's HTTP client. Verified 2026-11-21 by
 * `security-reviewer` against a probe HTTP server: sanitising payloads carrying
 * remote `src`, `href`, `@import`, `poster`, `object` and `xlink:href` produced
 * **zero** outbound requests, because DOMPurify parses into a detached document
 * and never drives jsdom's resource loader.
 *
 * **jsdom must stay up to date, and that is DOMPurify's own instruction rather
 * than caution:** its README says older jsdom versions are "known to be buggy
 * in ways that result in XSS *even if* DOMPurify does everything 100%
 * correctly", names jsdom 19 as a concrete example, and frames the server-side
 * DOM as part of the trusted computing base. It also names `happy-dom` as
 * explicitly unsafe to pair with DOMPurify — so do not swap jsdom for the
 * faster-looking option.
 */
const { window } = new JSDOM("");
const purify = createDOMPurify(window);

/**
 * `bodyHtml` with everything that can execute taken out.
 *
 * **Why this runs on write.** Sanitising at render — what the reference project
 * does, inside the component's `dangerouslySetInnerHTML` — leaves safety as
 * something every future consumer has to remember: a second page, a digest, an
 * AI prompt. Deriving a column instead means the dangerous string is handled in
 * one place. Why there are two columns at all, and which one a consumer may
 * read, is on the columns themselves in `prisma/schema.prisma`.
 *
 * **That rule is a convention, not an enforcement, and the first version of
 * this comment claimed otherwise.** It said the raw column has "exactly one
 * reader (this function)" and that forgetting to sanitise "stops being a
 * mistake that is available". Measured: this function never reads the column —
 * it is handed the string before the row exists — and the only reader is
 * `WEBHOOK_ANSWER_FIELDS`, which selects it deliberately. The one check that
 * exists is `e2e/tickets-api.spec.ts`, which asserts no row of
 * `GET /api/tickets` carries `bodyHtml`; a `GET /api/tickets/:id` written next
 * week could select it with nothing going red.
 *
 * **DOMPurify's defaults are used as they come.** They drop `<script>`,
 * event-handler attributes and `javascript:` URLs while keeping tables, lists,
 * links, images and inline `style` attributes. `<style>` blocks and `<head>` do
 * **not** survive them (measured), so a mail's own stylesheet is gone by the
 * time anything reads this column — that is a typography problem for the page
 * that renders it, not a sanitiser setting to loosen. A hand-written
 * `ALLOWED_TAGS` here would be a narrower list this project has no evidence for
 * and would then have to maintain, against a library allow-list that has been
 * attacked for a decade.
 *
 * **It does not address prompt injection**, which Phase 5's AI features need:
 * see the Known gaps table in the root CLAUDE.md.
 *
 * It is also the slow part of the request it runs in — see
 * `BODY_HTML_MAX_LENGTH` in `inbound-email.routes.ts` for what that costs and
 * what bounds it.
 */
export function sanitizeBodyHtml(html: string): string {
  return purify.sanitize(html);
}

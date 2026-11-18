import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { describe, expect, it } from "vitest";
import { useTicketListQuery } from "./use-ticket-list-query";

// The hook is the only place the URL's spelling of this list's question and the
// app's spelling of it meet, so it is the only place either can be read wrong.
// The cases worth having are the ones a browser cannot be made to produce on
// demand: a URL somebody typed by hand, and a query that happens to match the
// default and should therefore leave no trace.
//
// A real MemoryRouter rather than a fake: useSearchParams is the subject here,
// and a fake one would be the thing under test standing in for itself.
// `navigate` comes out too, because `replace` can only be proven by trying to
// go back.
function renderTicketListQuery(initialUrl = "/tickets") {
  return renderHook(
    () => ({
      ...useTicketListQuery(),
      location: useLocation(),
      navigate: useNavigate(),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(MemoryRouter, { initialEntries: [initialUrl] }, children),
    },
  );
}

describe("useTicketListQuery", () => {
  it("asks for newest first when the URL says nothing", () => {
    const { result } = renderTicketListQuery();

    expect(result.current.listQuery).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    expect(result.current.sorting).toEqual([{ id: "createdAt", desc: true }]);
  });

  it("reads a sort out of the URL", () => {
    const { result } = renderTicketListQuery("/tickets?sortBy=subject&sortOrder=asc");

    expect(result.current.listQuery).toEqual({
      sortBy: "subject",
      sortOrder: "asc",
    });
    expect(result.current.sorting).toEqual([{ id: "subject", desc: false }]);
  });

  // The URL the app itself produces most often, because `toSearchParams` drops
  // whichever half already matches the default — so `?sortBy=status` is what a
  // click on Status writes. The missing half has to take its default *through*
  // the schema; read as the `null` URLSearchParams actually returns, it fails
  // the enum and the whole query falls back, quietly undoing the click.
  it("fills in the half of the sort the URL leaves out", () => {
    const { result } = renderTicketListQuery("/tickets?sortBy=subject");

    expect(result.current.listQuery).toEqual({
      sortBy: "subject",
      sortOrder: "desc",
    });
  });

  // A hand-typed URL is the only way to reach this: nothing in the app can
  // produce it, because every link is built from a column that exists. The
  // server refuses the same value with a 400, which is the check that counts —
  // this one keeps a typo showing the list instead of an error page.
  it("falls back when the URL names a column the API does not sort by", () => {
    const { result } = renderTicketListQuery("/tickets?sortBy=bodyHtml");

    expect(result.current.listQuery).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  // The whole query falls back together, not field by field — `sortBy=subject`
  // is discarded here along with the bad direction. Worth knowing rather than
  // worth changing: one invalid half means the URL was not written by this app,
  // and guessing which half to keep would be guessing.
  it("falls back when the URL names a direction that is not asc or desc", () => {
    const { result } = renderTicketListQuery(
      "/tickets?sortBy=subject&sortOrder=sideways",
    );

    expect(result.current.listQuery).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("writes the chosen sort into the URL", () => {
    const { result } = renderTicketListQuery();

    act(() => {
      result.current.onSortingChange([{ id: "subject", desc: false }]);
    });

    expect(result.current.location.search).toBe("?sortBy=subject&sortOrder=asc");
    expect(result.current.listQuery).toEqual({
      sortBy: "subject",
      sortOrder: "asc",
    });
  });

  // TanStack hands over a function rather than a value when a header is
  // clicked, so the value form alone would leave the real path untested.
  it("accepts the updater function TanStack actually sends", () => {
    const { result } = renderTicketListQuery();

    act(() => {
      result.current.onSortingChange(() => [{ id: "status", desc: true }]);
    });

    expect(result.current.location.search).toBe("?sortBy=status");
  });

  // A sort that already matches the server's default leaves no tail on the URL,
  // so /tickets stays /tickets rather than carrying a query string asking for
  // exactly what it would get anyway.
  it("leaves no query string when the sort returns to the default", () => {
    const { result } = renderTicketListQuery(
      "/tickets?sortBy=subject&sortOrder=asc",
    );

    act(() => {
      result.current.onSortingChange([{ id: "createdAt", desc: true }]);
    });

    expect(result.current.location.search).toBe("");
  });

  // An empty sort is a state TicketsTable is configured never to produce
  // (`enableSortingRemoval: false`), and the API has no unordered answer. If one
  // ever arrives the URL is left exactly as it was rather than being half-written.
  it("ignores a sort with no column in it", () => {
    const { result } = renderTicketListQuery(
      "/tickets?sortBy=subject&sortOrder=asc",
    );

    act(() => {
      result.current.onSortingChange([]);
    });

    expect(result.current.location.search).toBe("?sortBy=subject&sortOrder=asc");
  });

  it("reads all three filters out of the URL", () => {
    const { result } = renderTicketListQuery(
      "/tickets?search=csv&status=open&category=refund_request",
    );

    expect(result.current.listQuery).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
      search: "csv",
      status: "open",
      category: "refund_request",
    });
  });

  // **What guards the five `?? undefined`s.** A missing `??` hands zod the `null`
  // that `searchParams.get` returns for an absent parameter; `.optional()`
  // admits `undefined` and not `null`, so the parse fails and the *whole* query
  // falls back — the filter the URL did carry is dropped along with it.
  //
  // Be exact about the shape of that coverage, because it is not one case per
  // `??`. Removing the `??` after a parameter breaks every URL that **omits**
  // that parameter, so the case naming it is the one case that survives.
  // Measured 2026-11-19: deleting the `??` after `status` turns 9 tests red
  // across this file and TicketsPage.test.tsx — including the search-only and
  // category-only cases below, but **not** the status-only one, whose URL does
  // carry a status. Together the three cover all five `??`; individually none of
  // them points at a particular one.
  const ONLY_FILTER = [
    { name: "a search", url: "/tickets?search=csv", expected: { search: "csv" } },
    { name: "a status", url: "/tickets?status=open", expected: { status: "open" } },
    {
      name: "a category",
      url: "/tickets?category=refund_request",
      expected: { category: "refund_request" },
    },
  ];

  for (const { name, url, expected } of ONLY_FILTER) {
    it(`keeps ${name} that is the only parameter in the URL`, () => {
      const { result } = renderTicketListQuery(url);

      expect(result.current.listQuery).toEqual({
        sortBy: "createdAt",
        sortOrder: "desc",
        ...expected,
      });
    });
  }

  // A blank parameter is not a value the app writes — `toSearchParams` leaves an
  // empty search out — so this is the hand-typed case. It has to read as "not
  // filtering" rather than failing the parse, which is what the schema's
  // `"" -> undefined` transform buys.
  it("treats a blank search in the URL as no search", () => {
    const { result } = renderTicketListQuery("/tickets?search=");

    expect(result.current.listQuery).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  const OUTSIDE_THE_ENUM = [
    { parameter: "status", url: "/tickets?status=pending" },
    { parameter: "category", url: "/tickets?category=billing" },
  ];

  for (const { parameter, url } of OUTSIDE_THE_ENUM) {
    it(`falls back when the URL names a ${parameter} the API refuses`, () => {
      const { result } = renderTicketListQuery(url);

      expect(result.current.listQuery).toEqual({
        sortBy: "createdAt",
        sortOrder: "desc",
      });
    });
  }

  it("writes a filter into the URL", () => {
    const { result } = renderTicketListQuery();

    act(() => {
      result.current.setFilters({ status: "open" });
    });

    expect(result.current.location.search).toBe("?status=open");
  });

  it("leaves no query string when the last filter is cleared", () => {
    const { result } = renderTicketListQuery("/tickets?search=csv");

    act(() => {
      result.current.setFilters({ search: undefined });
    });

    expect(result.current.location.search).toBe("");
  });

  // **The test the landmine fix exists for.** `toSearchParams` used to be built
  // from nothing but the sort, so before filters existed there was nothing to
  // lose; a click on a header would now have cleared the search box and both
  // dropdowns. Break it by dropping the `...listQuery` spread in
  // `onSortingChange` and this is the only test that goes red.
  it("keeps the filters when a header is clicked", () => {
    const { result } = renderTicketListQuery(
      "/tickets?search=csv&status=open&category=refund_request",
    );

    act(() => {
      result.current.onSortingChange([{ id: "subject", desc: false }]);
    });

    expect(result.current.listQuery).toEqual({
      sortBy: "subject",
      sortOrder: "asc",
      search: "csv",
      status: "open",
      category: "refund_request",
    });
  });

  // The mirror, and the reason `setFilters` spreads too: narrowing the list must
  // not quietly re-order it.
  it("keeps the sort when a filter changes", () => {
    const { result } = renderTicketListQuery("/tickets?sortBy=subject");

    act(() => {
      result.current.setFilters({ status: "open" });
    });

    expect(result.current.listQuery).toEqual({
      sortBy: "subject",
      sortOrder: "desc",
      status: "open",
    });
  });

  // `replace` can only be shown by trying to go back, which is also the thing it
  // is for: a debounced keystroke should not leave a history entry behind, so
  // leaving a search takes one press of the back button rather than one per
  // pause in the typing. MemoryRouter clamps `go(-1)` at the first entry, so
  // "nothing moved" is the assertion.
  it("replaces the entry when the caller asks it to", () => {
    const { result } = renderTicketListQuery();

    act(() => {
      result.current.setFilters({ search: "csv" }, { replace: true });
    });
    expect(result.current.location.search).toBe("?search=csv");

    act(() => {
      result.current.navigate(-1);
    });

    expect(result.current.location.search).toBe("?search=csv");
  });

  // The default, and what every other writer here relies on: a dropdown and a
  // header both push, so the back button undoes them one at a time.
  it("pushes the entry when the caller does not", () => {
    const { result } = renderTicketListQuery();

    act(() => {
      result.current.setFilters({ status: "open" });
    });
    expect(result.current.location.search).toBe("?status=open");

    act(() => {
      result.current.navigate(-1);
    });

    expect(result.current.location.search).toBe("");
  });
});

import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { useTicketSort } from "./use-ticket-sort";

// The hook is the only place the URL's spelling of a sort and TanStack's
// spelling of one meet, so it is the only place either can be read wrong. The
// cases worth having are the ones a browser cannot be made to produce on
// demand: a URL somebody typed by hand, and a sort that happens to match the
// default and should therefore leave no trace.
//
// A real MemoryRouter rather than a fake: useSearchParams is the subject here,
// and a fake one would be the thing under test standing in for itself.
function renderTicketSort(initialUrl = "/tickets") {
  return renderHook(
    () => ({ ...useTicketSort(), location: useLocation() }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(MemoryRouter, { initialEntries: [initialUrl] }, children),
    },
  );
}

describe("useTicketSort", () => {
  it("asks for newest first when the URL says nothing", () => {
    const { result } = renderTicketSort();

    expect(result.current.listQuery).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    expect(result.current.sorting).toEqual([{ id: "createdAt", desc: true }]);
  });

  it("reads a sort out of the URL", () => {
    const { result } = renderTicketSort("/tickets?sortBy=subject&sortOrder=asc");

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
    const { result } = renderTicketSort("/tickets?sortBy=subject");

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
    const { result } = renderTicketSort("/tickets?sortBy=bodyHtml");

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
    const { result } = renderTicketSort(
      "/tickets?sortBy=subject&sortOrder=sideways",
    );

    expect(result.current.listQuery).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("writes the chosen sort into the URL", () => {
    const { result } = renderTicketSort();

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
    const { result } = renderTicketSort();

    act(() => {
      result.current.onSortingChange(() => [{ id: "status", desc: true }]);
    });

    expect(result.current.location.search).toBe("?sortBy=status");
  });

  // A sort that already matches the server's default leaves no tail on the URL,
  // so /tickets stays /tickets rather than carrying a query string asking for
  // exactly what it would get anyway.
  it("leaves no query string when the sort returns to the default", () => {
    const { result } = renderTicketSort(
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
    const { result } = renderTicketSort(
      "/tickets?sortBy=subject&sortOrder=asc",
    );

    act(() => {
      result.current.onSortingChange([]);
    });

    expect(result.current.location.search).toBe("?sortBy=subject&sortOrder=asc");
  });
});

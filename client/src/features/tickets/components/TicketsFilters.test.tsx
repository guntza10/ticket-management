import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TicketFilters } from "../hooks/use-ticket-list-query";
import TicketsFilters from "./TicketsFilters";

// Fake timers because the search box is the one control here that does not act
// on the keystroke that caused it. Nothing else in this suite needs them, so
// they are turned on and off per file rather than globally.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const SEARCH_BOX = { name: "Search tickets" };

function typeSearch(value: string) {
  fireEvent.change(screen.getByRole("textbox", SEARCH_BOX), {
    target: { value },
  });
}

function runDebounce() {
  act(() => {
    vi.advanceTimersByTime(300);
  });
}

/**
 * Stands in for `TicketsPage` + `useTicketListQuery`, and the one detail that
 * matters is `{ ...query, ...patch }` — a patch applied to the query **as that
 * render saw it**, which is exactly what `setFilters` does. A functional
 * `setQuery(q => …)` here would be a harness that cannot reproduce the fault the
 * real one has.
 *
 * The second writer is a plain button rather than the status dropdown: what is
 * under test is the search box committing late, and driving Radix's Select
 * through jsdom would add a dependency on pointer-event polyfills that this
 * question does not need.
 */
function Harness() {
  const [query, setQuery] = useState<TicketFilters>({});

  return (
    <>
      <TicketsFilters
        filters={query}
        onChange={(patch) => {
          setQuery({ ...query, ...patch });
        }}
      />
      <button type="button" onClick={() => setQuery({ ...query, status: "open" })}>
        pick status
      </button>
      <output>{JSON.stringify(query)}</output>
    </>
  );
}

function committedQuery() {
  return JSON.parse(screen.getByRole("status").textContent ?? "") as unknown;
}

describe("TicketsFilters", () => {
  it("asks once for the last thing typed, not once per keystroke", () => {
    const onChange = vi.fn();
    render(<TicketsFilters filters={{}} onChange={onChange} />);

    typeSearch("c");
    typeSearch("cs");
    typeSearch("csv");
    expect(onChange).not.toHaveBeenCalled();

    runDebounce();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      { search: "csv" },
      { replace: true },
    );
  });

  // Mounting is not a keystroke, so it must not navigate — and the case has to
  // be its own test because every other one types first, which cannot tell
  // "never fired" from "fired once, late".
  //
  // `filters.search` is seeded on purpose: `useState(filters.search ?? "")` plus
  // the sync effect is exactly the arrangement that would commit on mount if the
  // debounce were an effect over `[draft]`, which is the shape this component
  // deliberately does not use. Measured 2026-11-19 — adding such an effect
  // turns this test red **and** *"asks once for the last thing typed"*, two of
  // eight. Both, not just this one: the effect fires on mount and then again
  // per keystroke, so it breaks the count as well as the mount. This test is
  // still the only one that isolates the mount, which is why it exists.
  it("does not navigate when it is only mounted", () => {
    const onChange = vi.fn();
    render(<TicketsFilters filters={{ search: "csv" }} onChange={onChange} />);

    runDebounce();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the search rather than sending an empty one", () => {
    const onChange = vi.fn();
    render(<TicketsFilters filters={{ search: "csv" }} onChange={onChange} />);

    typeSearch("");
    runDebounce();

    expect(onChange).toHaveBeenCalledWith(
      { search: undefined },
      { replace: true },
    );
  });

  // The URL can change with nobody typing — the back button is the live case —
  // and `useState`'s argument is read once at mount, so the box cannot follow it
  // on its own. Re-rendering with a different `filters.search` is that, without
  // a browser: delete the effect and this is the only test that goes red.
  it("follows the search in the URL when it changes with no keystroke", () => {
    const { rerender } = render(
      <TicketsFilters filters={{ search: "csv" }} onChange={vi.fn()} />,
    );
    expect(screen.getByRole("textbox", SEARCH_BOX)).toHaveValue("csv");

    rerender(<TicketsFilters filters={{}} onChange={vi.fn()} />);

    expect(screen.getByRole("textbox", SEARCH_BOX)).toHaveValue("");
  });

  // What the unmount cleanup is for. Without it the timer still fires, and it
  // calls a navigation out of a component that is no longer on the page.
  it("does not commit a search typed just before it was unmounted", () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <TicketsFilters filters={{}} onChange={onChange} />,
    );

    typeSearch("csv");
    unmount();
    runDebounce();

    expect(onChange).not.toHaveBeenCalled();
  });

  // Pins the label on each dropdown, which is also the only locator a test has
  // for them — Radix gives the trigger no name of its own.
  //
  // **Be clear what this does not prove.** It was `aria-label` until 2026-11-19
  // and would have passed then too, because jsdom computes the accessible
  // *name* and both spellings produce the same one. The reason for the change is
  // that `aria-label` outranks the trigger's content, which is the text saying
  // what is currently selected; whether assistive technology then still
  // announces that value is not something this layer can answer.
  it("names each dropdown", () => {
    render(<TicketsFilters filters={{}} onChange={vi.fn()} />);

    expect(
      screen.getByRole("combobox", { name: "Filter by status" }),
    ).toHaveTextContent("All statuses");
    expect(
      screen.getByRole("combobox", { name: "Filter by category" }),
    ).toHaveTextContent("All categories");
  });

  // The other half of the same claim, and the half that actually exercises the
  // wiring: the test above renders `filters={{}}`, where every trigger reads its
  // "any" label and would do so even if `value` were ignored entirely.
  //
  // Three things have to be right for this to pass — `value={value ?? ANY}`
  // feeding the Select, the labels map being keyed by the enum member, and the
  // member spelling matching between core and the map. It is also the only
  // component-level proof that a filter already in the URL is *visible*; the
  // browser spec checks it after a reload, which is a slower place to learn that
  // a dropdown silently forgot what the page was filtered by.
  it("shows the filters it was given rather than the any labels", () => {
    render(
      <TicketsFilters
        filters={{ status: "open", category: "refund_request" }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Filter by status" }),
    ).toHaveTextContent("Open");
    expect(
      screen.getByRole("combobox", { name: "Filter by category" }),
    ).toHaveTextContent("Refund Request");
  });

  // The fault this guards: a filter chosen between the keystroke and the commit
  // used to be erased by the commit. The timer held the `onChange` built at
  // keystroke time, and that one carries the query as it was *then* — a query
  // with no status in it — so spreading the search patch over it wrote the
  // status back out of existence 300ms after the person chose it.
  //
  // Break it by calling `onChange` instead of `onChangeRef.current` in
  // handleSearchChange: this goes red, the two above stay green.
  it("keeps a filter chosen while the search was still being typed", () => {
    render(<Harness />);

    typeSearch("csv");
    fireEvent.click(screen.getByRole("button", { name: "pick status" }));
    runDebounce();

    expect(committedQuery()).toEqual({ status: "open", search: "csv" });
  });
});

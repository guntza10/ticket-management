import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SEARCH_MAX_LENGTH,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
} from "../../../../../core/schemas/tickets.ts";
import type {
  SetTicketFilters,
  TicketFilters,
} from "../hooks/use-ticket-list-query";
import { categoryLabel, statusLabel } from "../labels";

/**
 * How long the search box waits after the last keystroke before asking the
 * server.
 *
 * It exists because the two dropdowns beside it apply the moment they are
 * touched, and three controls in one toolbar should not each have their own
 * rule about when they take effect. The alternative — a Search button or
 * Enter — reads as a different kind of control, which is right on a page where
 * searching *is* the task and wrong on a toolbar that narrows a list.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The value of each dropdown's "no filter" option.
 *
 * Radix refuses `value=""` on a `SelectItem` — the empty string is reserved for
 * clearing the whole select — so "any status" needs a word of its own. It never
 * reaches the URL: the handlers below look the chosen value up in the real
 * member list, and a value that is not in it (this one) comes back `undefined`,
 * which is exactly what "do not filter" already means everywhere else.
 *
 * **Spelled so it cannot collide**, because "not a member of the enum" is the
 * whole mechanism. It read `"all"` until 2026-11-19, which worked only as long
 * as nobody added a status or category called `all` — at which point the
 * dropdown would carry two items with that value and clearing the filter would
 * start filtering. Underscores buy that for nothing: no Postgres enum member
 * here is spelled this way, and the value never leaves this file.
 */
const ANY = "__any__";

/**
 * The toolbar above the ticket table: a search box over subject and sender, and
 * one dropdown per enum the server will filter by.
 *
 * It holds no filter state. The URL does, through `useTicketListQuery` — so a
 * refresh keeps the filters, the back button undoes them, and the view is a
 * link somebody can be sent. What this component *does* own is the half-typed
 * search term, which is not a filter yet.
 */
export default function TicketsFilters({
  filters,
  onChange,
}: {
  filters: TicketFilters;
  onChange: SetTicketFilters;
}) {
  const [draft, setDraft] = useState(filters.search ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The URL can change without anybody typing — the back button, a pasted
  // link — and the box has to follow it. A `key` on this component would do the
  // same by remounting, and would take the cursor out of the input while
  // somebody was using it.
  //
  // After the debounce commits, this also runs with the value already in
  // `draft`, which React drops as an identical state write.
  useEffect(() => {
    setDraft(filters.search ?? "");
  }, [filters.search]);

  // A timer that outlives the component would navigate after it is gone.
  useEffect(() => () => clearTimeout(timer.current), []);

  // **The debounce has to call the `onChange` that exists when it fires, not
  // the one that existed when the key was pressed.** `setFilters` upstream is
  // rebuilt every render with the query as it was *at that render* baked into
  // it, so a copy captured 300ms ago writes its patch over a stale query. The
  // fault that cost: choosing a status between the keystroke and the commit put
  // `?status=open` in the URL, and then the timer wrote `?search=csv` built from
  // the query it remembered — one with no status in it — so the status the
  // person had just chosen disappeared with nothing to connect it to.
  //
  // **`setSearchParams`'s updater form does not fix this**, which is worth
  // recording because it is the obvious first answer. That setter is itself
  // rebuilt per render (`useCallback` with `searchParams` in its deps) and hands
  // the updater *its own* render's params, so a stale setter stays stale.
  // Checked against react-router's source, 2026-11-19.
  //
  // An effect with no dependency array, so it runs after every render and the
  // ref always holds the newest one.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // **The debounce lives in the event handler, not in an effect.** It is a
  // reaction to a keystroke rather than a value this component has to stay in
  // sync with, which is React's own line for deciding between the two. It also
  // avoids two faults the effect version has to defend against by hand: it
  // cannot fire on mount, and it does not restart every time `onChange` is
  // recreated by a render.
  function handleSearchChange(value: string) {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // `|| undefined` so clearing the box removes `?search=` rather than
      // writing it empty. Through the ref, never the prop — see above.
      onChangeRef.current({ search: value || undefined }, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
  }

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row">
      <Input
        // aria-label, not just the placeholder: a placeholder is a weak
        // accessible name and disappears as soon as anything is typed, so a
        // test and a screen reader would both lose the control they are aiming
        // at.
        aria-label="Search tickets"
        placeholder="Search subject or sender"
        // The same ceiling `ticketListQuerySchema` enforces. Without it the box
        // would happily take a pasted term the server answers 400 to, and the
        // hook's own parse would then fall back to showing every row — text in
        // the box, no filtering, no explanation. Stopping the input is cheaper
        // than reporting that.
        maxLength={SEARCH_MAX_LENGTH}
        value={draft}
        onChange={(event) => handleSearchChange(event.target.value)}
      />
      <FilterSelect
        label="Filter by status"
        anyLabel="All statuses"
        value={filters.status}
        options={TICKET_STATUSES}
        labels={statusLabel}
        onValueChange={(status) => onChange({ status })}
      />
      <FilterSelect
        label="Filter by category"
        anyLabel="All categories"
        value={filters.category}
        options={TICKET_CATEGORIES}
        labels={categoryLabel}
        onValueChange={(category) => onChange({ category })}
      />
    </div>
  );
}

/**
 * One dropdown over one enum, plus the option that clears it.
 *
 * **Local to this file on purpose.** The two uses above are the same twelve
 * lines of markup and they genuinely must change together — a width, an extra
 * icon, a different "clear" affordance would be wanted on both — which is the
 * repo's own test for when repetition is worth removing. Keeping it in the same
 * file rather than in `FilterSelect.tsx` is the cheap half of that: there is no
 * second file to open and nothing outside this toolbar can grow a dependency on
 * an API that was guessed for two callers.
 *
 * It is generic over the member type so `onValueChange` hands back a real
 * `TicketStatus` or `TicketCategory` rather than a string the caller has to
 * cast.
 */
function FilterSelect<T extends string>({
  label,
  anyLabel,
  value,
  options,
  labels,
  onValueChange,
}: {
  /** The dropdown's visible-to-assistive-technology name. Radix renders the
   *  trigger as a combobox with no label of its own, so without this neither a
   *  screen reader nor a test can tell the status one from the category one. */
  label: string;
  /** What the "no filter" option is called, which is also what the trigger
   *  reads while nothing is filtered. */
  anyLabel: string;
  value: T | undefined;
  options: readonly T[];
  labels: Record<T, string>;
  onValueChange: (value: T | undefined) => void;
}) {
  // One id per rendered dropdown, so a second toolbar on a page could never
  // point two labels at the same control.
  const triggerId = useId();

  return (
    <>
      {/* A real `<label htmlFor>` rather than `aria-label` on the trigger, which
          is the shape Radix's own docs give (`<Label htmlFor="country">` beside
          `<Select.Trigger id="country">`). The difference is not cosmetic: the
          trigger's *content* is `SelectValue`, the words saying what is selected
          right now, and `aria-label` outranks content in the accessible-name
          computation — so naming the control that way spends the one place the
          current value had to be read from.

          `sr-only` because the toolbar has no room for three visible labels and
          the dropdowns already read "All statuses" / "All categories" when
          nothing is chosen. A visible label is the better answer the day this
          toolbar grows a second row.

          Honest about what the test below does and does not prove: it pins the
          accessible name, so the label cannot be dropped silently. It cannot
          show that a screen reader now reads the *value* too — jsdom models the
          name computation, not what assistive technology announces. */}
      <label htmlFor={triggerId} className="sr-only">
        {label}
      </label>
      <Select
        value={value ?? ANY}
        // Looked up in `options` rather than cast. Radix types its callback as
        // `string`, and `.find` gives back either a real member or `undefined`
        // — so ANY, and anything else that is not a member, becomes "no filter"
        // instead of travelling to the URL as a value the server would refuse.
        onValueChange={(next) => onValueChange(options.find((o) => o === next))}
      >
        <SelectTrigger id={triggerId} className="sm:w-44">
          {/* No `placeholder` on SelectValue: `value` above is never empty — it
              falls back to ANY — so a placeholder could not render, and passing
              one would be a prop that silently does nothing. The ANY option's
              own text is what the trigger shows instead. */}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{anyLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {labels[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

# Exports and analytics

Everything here is generated locally from the JSON data files; nothing is
uploaded.

## Application timeline CSV

Each application detail view has **Export timeline** next to **Export CSV**.
It saves a UTF-8 CSV (with BOM for Excel) containing:

- `Created` — the application record's creation timestamp;
- `Applied` — the applied date, when set;
- every recorded status change, with the previous status in `Detail`;
- the deadline and follow-up dates, when set;
- a final current-status row when the history is empty or behind the current
  status.

Columns are `Company, Job title, Date, Event, Status, Detail`. Date-only
fields use `YYYY-MM-DD`; timestamps use local `YYYY-MM-DD HH:mm`. Rows are
sorted chronologically. Invalid or missing dates are skipped rather than
guessed at.

Cells that begin with `=`, `+`, `-` or `@` (and the tracker CSV, which shares the
same escaping) are prefixed with an apostrophe, so job text pasted from a
posting cannot execute as a spreadsheet formula when the file is opened.

The save dialog is the same native dialog used by other exports; the browser
build downloads the file instead. The default name is
`<company>-timeline-YYYY-MM-DD.csv`.

## Calendar (.ics) export

On the Overview tab, the **Upcoming** card has **Export calendar (.ics)**. It
downloads all **future** deadlines and follow-ups for **active**
(wishlist/applied/interview) applications. Past dates, archived applications
and invalid dates are skipped.

Each date becomes an all-day `VEVENT`:

- `UID` is stable: `<applicationId>-deadline@ai-application-support` or
  `<applicationId>-followUp@ai-application-support`;
- `SUMMARY` is `Deadline: Company — Role` or `Follow-up: Company — Role`;
- `DESCRIPTION` includes the current status and application URL;
- `DTSTART`/`DTEND` are date-only, with `DTEND` the following day;
- `TRANSP:TRANSPARENT` keeps all-day entries from blocking work time.

There are no alarms by default. The file uses CRLF, correct TEXT escaping and
75-octet line folding. Stable UIDs let calendar apps update an event when the
same export is imported again, though some clients still duplicate events on
repeated imports; treat it as a one-time export. The file is named
`applications-calendar-YYYY-MM-DD.ics`.

## Analytics definitions

The Overview tab now includes two additional cards.

### Time to first response

The number of days from the applied date to the first `interview`, `offer` or
`rejection` status recorded in the application's history.

- The applied date comes from **Applied on**, falling back to the first
  `applied` entry in the status history.
- Only recorded response events count; `updatedAt` is never used as a proxy,
  so applications without a usable response date are excluded rather than
  given an invented speed.
- The card shows the **median** and **average** days plus the sample size
  (`n`). Rejections count as responses, consistent with the conversion rates.
- A same-day response counts as zero days.

### Source effectiveness

Applications that moved past the wishlist are grouped by their `Source`
field. Matching is case-insensitive and surrounding whitespace is ignored; a
blank source appears as **Not set**.

For each source the table shows application count, then response, interview
and offer rates. **Rejections count as responses.** Percentages are hidden
(shown as `—`) until a source has at least
`SOURCE_EFFECTIVENESS_MIN_SAMPLE` (3) applications, because one or two data
points are too noisy to present as a rate. Counts remain visible.

These statistics are only as good as the dates and sources entered in the
tracker; sparse historical data will produce small sample sizes.

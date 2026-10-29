# Roster Studio narration

## Scene 1

Welcome to Roster Studio, a planning workspace for Data Straw. Let's see how it schedules people, checks coverage, and responds when availability changes.

## Scene 2

Starting the interactive demo creates an isolated database workspace with thirty fictional employees. Generating a roster checks the configured rules, preserves pinned assignments, and reports any coverage that still needs attention.

## Scene 3

Rosters are organized by month, with separate drafts preserved when we switch periods. Here, February twenty twenty eight includes leap day. The monthly view adapts to the actual calendar, rather than assuming thirty days.

## Scene 4

Back in November, the weekly brand view makes the schedule easier to read. Each service has its own operating calendar and staffing requirement. A client's working days are separate from an employee's days off.

## Scene 5

The person view shows individual working days and time off. This gives managers another way to check the plan, instead of relying only on brand coverage totals.

## Scene 6

The pod view places the same work in its operational team context. Managers can filter by pod while keeping the underlying schedule consistent across views.

## Scene 7

The process view lets us inspect a particular kind of work. Selecting non delivery report management also includes services where that process is explicitly part of a compatible bundle.

## Scene 8

Eligibility is an authorization, not a scheduling guess. Managers specify who can cover each service and whether that person is primary or backup. Adding an employee does not automatically grant permission to cover every brand.

## Scene 9

Service settings expose operating calendars, minimum distinct staff, and capacity. They also define shift start and end times and timezone. Overnight duties and incompatible overlaps are checked against the actual configured intervals.

## Scene 10

The catalog supports people, brands, processes, pods, and team leads. Changes apply to the active month's configuration. Reference checks prevent unsafe deletion, and published snapshots remain part of the history.

## Scene 11

Here, we simulate sick leave for a brand's sole primary employee. Affected unlocked work is removed and coverage is rechecked. Pinned assignments are preserved so any conflict remains visible for review.

## Scene 12

The monthly review now shows two mandatory coverage gaps. Each issue identifies the service and date involved. Publishing stays blocked until mandatory issues are resolved, while preference notices are tracked separately.

## Scene 13

Opening the assignment inspector shows the affected shift and its coverage shortfall. In this case, there are no eligible replacements available without violating the configured candidate checks. The manager can see that limitation clearly.

## Scene 14

No safe replacement is available. Automatic repair keeps the gap visible. A manager must resolve it without bypassing mandatory rules.

## Scene 15

Drafts and published snapshots are stored in Postgres. The engine explains conflicts, without claiming optimal scheduling or labor law certification.

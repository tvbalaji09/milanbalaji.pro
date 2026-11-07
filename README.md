# Little steps activity tracker

A local application for two children, each with editable names, independent daily records, six daily goals: Reading (30 min), Academics (30 min), Exercise (30 min), Family & Fun (10 min), Guitar (20 min), and Journal (5 min), progress rings, and a monthly calendar. The local Python mode uses the standard library and JSON storage. Assets are bundled locally; optional dictionary lookups need internet access.

Requires Python 3.10+ and a current browser.

## Setup and start

```sh
cd /Users/balajitv/milanbalaji.pro
python3 --version
python3 server.py
```

Open **http://127.0.0.1:8000/kids-activity.html** (the root URL also works). Keep the terminal running. Stop with Ctrl+C; use the same startup command to restart. No installation or virtual environment is needed. Do not open the HTML as a file or run a separate static server.

To use a different port:

```sh
python3 server.py --port 8080
```

The server binds to `127.0.0.1` by default. It is intended for one local browser session; simultaneous tabs use last successful save wins.

## Use and backups

Select a child, edit their name, and choose any current or past date. Add 5 or 10 minutes, or enter exact daily totals and select **Save daily minutes**. All successful changes save automatically to disk. Each ring caps at that activity’s daily goal while totals retain extra minutes. Daily minutes must be nonnegative whole numbers, with at most 1440 minutes total. Future dates cannot be entered.

Use **Export JSON** to download both profiles and all records. **Restore JSON** accepts version 4 backups and older version 1, 2 or 3 backups, asks before replacing both profiles, validates the entire file, and saves it atomically. Invalid backups leave existing data intact. Export before restoring if you need to retain the previous records.

`data/activities.json` is created on first startup, outside the publicly served `public/` folder. Writes use a temporary file in the same directory, file flush/fsync, atomic replacement, and directory fsync. A corrupt existing JSON file causes startup to fail rather than overwriting it: preserve a copy and repair it or move it aside before starting and restoring an exported backup. The JSON endpoint intentionally supplies records to the local app; filesystem paths are never publicly served.

The folder supplied for this task was empty, so no original `kids-activity.html` design or legacy backup format was available. The included page provides a new rings-and-calendar design. Restores support the application’s version 1 through version 4 schemas, not unknown external formats.

## Tests

```sh
cd /Users/balajitv/milanbalaji.pro
python3 -m unittest discover -s tests -v
node --check public/app.js
```

Node is optional and only used for JavaScript syntax verification. Tests use temporary storage and a loopback HTTP server; they do not change personal records. They cover saving, server restart, export/restore round trips, invalid restores, separate children, private-file access, and failed atomic writes.

## Free hosted version: Cloudflare Workers + D1

This checkout is already configured for D1 database `milanbalaji-activities` in your Cloudflare account. The initial schema has been applied remotely and the Worker is deployed at https://app.milanbalaji.workers.dev. Both login secrets are configured; sign in with username `family` and the password you set. The preview HTML and API both return HTTP 401 login challenges over HTTPS when unauthenticated. You can skip database creation and the initial deployment below for this existing installation.

Cloudflare assigned `harlan.ns.cloudflare.com` and `millie.ns.cloudflare.com` to `milanbalaji.pro`. The custom-domain route is already configured and Cloudflare accepted it. At the latest deployment, zone activation and public DNS propagation were still pending; the custom domain's HTTPS availability has not yet been verified. The preview URL can be used meanwhile.

The same interface can now run online. The hosted version stores both profiles in Cloudflare D1, rather than `data/activities.json`. The Python app above still works offline and uses its original atomic JSON storage. Data does not sync automatically between the two: use JSON export/restore to transfer it. No personal records are included in deployment assets.

Cloudflare's Workers and D1 free plans have usage limits, which should be ample for a family tracker. Domain renewal at Spaceship remains separate. Use the Free plans; no paid database is required. Current details: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

Hosted backups are limited to **1 MB** (the local Python app accepts 5 MB). Save and restore use one atomic SQL update. A revision check prevents another tab/device from silently overwriting a newer save; if you see a conflict, reload to get the latest records before editing. Export any unsaved values separately before reloading. Dates are validated using Europe/London time, configurable through `TIME_ZONE` in `wrangler.jsonc`.

The hosted API uses `X-Activities-Revision` for its revision check so Cloudflare compression or cache features can weaken/remove ETags without blocking saves. Legacy ETag clients are also supported. Browser checks cover saving each child's name and minutes, then reloading, with both weak and missing ETags.

### 1. Create your account and install tools

Create a free account at https://dash.cloudflare.com/sign-up. Install Node.js 22.13+ (a current LTS is recommended), then:

```sh
cd /Users/balajitv/milanbalaji.pro
npm ci
npx wrangler login
npx wrangler whoami
```

`wrangler login` opens your browser. Authorize your own account there. Never put passwords, Cloudflare tokens, or `.dev.vars` in Git or this chat.

### 2. Create persistent storage

```sh
npx wrangler d1 create milanbalaji-activities
```

Copy the returned `database_id` into the `d1_databases` entry of `wrangler.jsonc`, replacing `00000000-0000-0000-0000-000000000000`. If you already created this database, use `npx wrangler d1 list` to find its ID instead of creating another.

Initialize the remote database:

```sh
npx wrangler d1 migrations apply milanbalaji-activities --remote
```

Migrations preserve existing data. The first migration creates two empty profiles, not a copy of your local records.

### 3. Deploy and set a family login

```sh
npm run deploy
npx wrangler secret put APP_USERNAME
npx wrangler secret put APP_PASSWORD
```

The secret commands prompt privately. Choose a username without `:` and a long, unique password. Until both secrets exist, the deployed app returns HTTP 503 and exposes no journal or assets. Once configured, opening the printed `https://milanbalaji-activities.<your-subdomain>.workers.dev` URL shows a browser login prompt. Authentication protects HTML, CSS, JavaScript, and the API on every hostname. Passwords are stored as Cloudflare secrets and are never sent in application HTML. Use HTTPS. To rotate either credential, run the corresponding secret command again. Browsers cache HTTP Basic credentials; close the browser/private window to end your session.

Test saving minutes, reloading, switching children, exporting, and restoring on this URL before moving your domain. To migrate existing records, export from the local Python app and restore into the hosted app after signing in. Subsequent deployments retain the D1 records:

```sh
npm run deploy
```

### 4. Connect milanbalaji.pro from Spaceship

1. In Cloudflare, select **Add a domain**, enter `milanbalaji.pro`, and choose the **Free** zone plan.
2. Review imported DNS records. Preserve any existing mail (MX/TXT), verification, or other service records.
3. Cloudflare gives you two authoritative nameservers. In Spaceship, open the domain's nameserver settings, select custom nameservers, and enter exactly those two values. Registration stays at Spaceship; Cloudflare will manage DNS. Wait until Cloudflare shows the domain as **Active**.
4. In Cloudflare DNS, remove only parking A/AAAA/CNAME records at the root `@` that conflict with the new app. Do not change mail records.
5. Add the following top-level property to `wrangler.jsonc` (with a comma separating it from the preceding property):

```json
"routes": [{"pattern": "milanbalaji.pro", "custom_domain": true}]
```

6. Run `npm run deploy` again. Cloudflare creates the required domain routing and HTTPS certificate. Open **https://milanbalaji.pro**, sign in, and verify a save survives reload. Certificate/DNS activation may take time. The workers.dev hostname remains protected by the same login.

Do not point Spaceship DNS at a guessed Cloudflare IP. Custom Domains require the domain to be active in your Cloudflare account. Reference: [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

### Local Worker testing (separate from Python data)

```sh
npm ci
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` to choose local test credentials, then:

```sh
npx wrangler d1 migrations apply milanbalaji-activities --local
npm run dev
```

Open the localhost URL printed by Wrangler and use your local test credentials. This stores test data under ignored `.wrangler/`, not in your remote database or Python JSON. These local credentials are never uploaded; remote credentials must be set with `wrangler secret put`.

Checks:

```sh
npm test
npm run check
python3 -m unittest discover -s tests -v
```

Worker tests execute the actual SQL against temporary file-backed SQLite and cover save/reopen/restore, child isolation, invalid backups, stale saves, authentication, storage errors, and cross-origin writes. `npm run check` validates and bundles the Cloudflare configuration without publishing. Actual remote deployment requires your Cloudflare account, the real D1 ID, and login secrets.

### Short app address

The main app URL is **https://app.milanbalaji.workers.dev**. The account subdomain is now `milanbalaji`; previous URLs under `tvbalaji09-milanbalaji.workers.dev` are retired.

`cloudflare/alias.mjs` forwards the original request through the `ACTIVITIES` service binding to `milanbalaji-activities`. This shares its existing password protection, API validation, and D1 records. There is no duplicate database or separate login. The custom domain `milanbalaji.pro` still routes to the original backend.

Deploy app changes with `npm run deploy` as before. The alias automatically uses the backend's deployed version. To change or recreate the alias itself:

```sh
npx wrangler deploy --config wrangler.alias.jsonc
```

Continue setting secrets with the main `wrangler.jsonc` configuration, not the alias configuration.

### Six skills and positive affirmations

The app tracks Reading, Academics, and Exercise at 30 minutes each; Family & Fun at 10 minutes; Guitar at 20 minutes; and Journal at 5 minutes. Six calendar bars use these individual goals. New exports use version 4 and the daily keys `reading`, `academics`, `exercise`, `family_fun`, `guitar`, and `journal`.

Existing version 1 records and backups upgrade when read/restored: the original minutes and names are preserved and the three new activities start at zero. No bulk database rewrite or destructive migration is needed. The next successful save persists the current backup version. Reload older open tabs after updating. Restoring a version 1 backup replaces the journal and sets the new skills to zero, so export current records first if you want to keep those minutes.

The page includes 36 affirmations about self-worth, belonging, kindness, learning, feelings, and asking for support. Four appear at once; **More kind words** cycles through them. Messages vary by child and selected date and never depend on completed goals.

### Daily journal entries

Choose a child and a date using the date picker or monthly calendar, then complete any of the five optional prompts: Today’s mood, Tomorrow’s little goal, Something I’m thankful for, Something challenging, and My proud moment. Click **Save journal**. Each answer accepts up to 2,000 characters. Saving journal text is independent of the Journal activity’s five-minute total. Saving all five answers empty removes that day’s journal entry.

A 📝 marker identifies dates with saved journal entries. Selecting the day loads the entry for the selected child; other children’s entries remain separate. Unsaved drafts are retained in memory while navigating dates/profiles or saving activity minutes. Reloading/closing the page can discard drafts, so the browser warns before leaving with unsaved text. Save each draft to persist it. Failed saves retain the draft so you can retry.

- **Export this entry** downloads the selected day’s saved journal as UTF-8 text.
- **Export all journals** downloads the selected child’s saved journals in date order as UTF-8 text.
- **Export JSON** includes both profiles, all activity minutes, and all saved journals; use **Restore JSON** to recover the entire backup. Text exports are for reading and cannot be restored. Save drafts before exporting or restoring.

Version 3 adds an `entries` object to each child, keyed by ISO date. Every entry contains the string fields `mood`, `tomorrow_goal`, `thankful`, `challenge`, and `proud`. Existing version 1/2 records upgrade with empty journal collections. No destructive database migration is needed. Restoring an older backup replaces the current records and clears journals that were not included in that older backup; export a current JSON backup first if needed.

## Milan and Balaji pages

Milan’s missions remain at `/`. The second-child selector has been removed; its historical records remain archived in the existing activities document and JSON backups. Balaji’s independent space is at `/balaji` (also `/balaji/`). Balaji’s page links to Milan’s missions. Milan’s page does not show a link to Balaji’s space; open `/balaji` directly.

Balaji has four daily completion checkboxes: **Connect, Move, Health, Learn**, plus six optional journal prompts: **Mood & energy, Today’s win, Work & learning, Health & fitness, Gratitude, Tomorrow’s priority**. Use the date pickers to view or change any current or past day’s records. Goals save immediately; reflections use **Save my reflection**. Journal drafts stay in memory while browsing dates or saving goals; save them before leaving the page.

Balaji’s **Backup JSON / Restore backup** affects only his goals and reflections. It cannot overwrite Milan or the archived child’s records. Daily/all-reflection text exports are also available. Keep separate JSON backups for the two pages. Both hosted pages use the existing family login; these are separate journals within one household account, not separate authentication accounts.

Local setup and review:

```sh
python3 server.py --port 8010
```

Open http://127.0.0.1:8010/balaji and http://127.0.0.1:8010/. Local adult records save atomically to ignored `data/balaji.json`; existing records remain in `data/activities.json`. All supplied PNGs are copied into `public/assets/` and served locally, with no external asset requests.

For Cloudflare publication **after reviewing the local preview**, initialize the new independent table before deploying:

```sh
npx wrangler d1 migrations apply milanbalaji-activities --remote
npm run deploy
```

Migration `0002_balaji.sql` creates and initializes a separate `balaji` table. It does not alter the `activities` table or remove any family records. The short `app.milanbalaji.workers.dev/balaji` alias automatically uses the same backend. Each journal document retains the existing 1 MB hosted request limit, with 2,000 characters per journal prompt. Uploaded artwork is included unchanged.

### Milan’s comic-book redesign

Milan’s page uses the three supplied Spider-Man PNGs at `public/assets/milan-hero.png`, `milan-swing.png`, and `milan-leap.png`. The images are copied unchanged and served locally. The design uses red/blue comic panels, halftone backgrounds, yellow encouragement cards, six mission cards, and the existing journal and calendar. It uses no flashing/strobing effects or external fonts/assets. Balaji retains his separate darker design.

Review both pages locally at http://127.0.0.1:8010/ and http://127.0.0.1:8010/balaji before publishing. Desktop, tablet, and phone layout checks cover all three new images, rings, journal prompts, affirmations, and calendar navigation.

### Publication status

The reviewed Milan redesign and Balaji page were published on 7 November 2026. Live pages are https://milanbalaji.pro/ and https://milanbalaji.pro/balaji; the short Workers aliases remain available at https://app.milanbalaji.workers.dev/ and `/balaji`. Migration `0002_balaji.sql` has been applied to the production database. HTTPS and login challenges were verified for both pages, both APIs, and the new image assets. The existing family login is unchanged.

## Spending, diesel and vocabulary

These additions have been reviewed locally and published. Start with `python3 server.py --port 8010` and open `/balaji` or `/`.

### Balaji’s money logs

Select a past/current date using the shared date control. **Add spend** saves a description, category and GBP amount; **Add diesel** saves the amount for that same date. You can add up to 100 entries per day in each log, edit them, or remove them. Diesel is included once in the combined day/month totals; do not also enter the same purchase in daily spending.

All currency is stored as whole **pence**. A new calendar month starts a new total automatically; it does not delete older months. Selecting a date shows that month’s combined total, diesel total, category breakdown, and daily average. The average uses elapsed calendar days for the current month and the full number of days for previous months. Calendar £ markers show days with spending.

**Export month CSV** includes the selected month’s expense and diesel entries, once each. **Backup JSON** includes the entire history, reflections and goals. Expense/diesel drafts remain in memory while navigating dates and are retained after failed saves. Save or cancel them before exporting or restoring. Balaji backups now use version 2 (`expenses` and `diesel`, keyed by ISO date); version 1 backups upgrade with empty logs.

### Milan’s words

The journal has a rotating daily word with an original, child-friendly offline definition. **Add to my words** saves it to the selected day. Type another word and its meaning is looked up automatically after a short pause. **Find meaning** retries a lookup. You can edit a meaning and add several words, then edit/remove saved words later. The limit is 100 words per child/date, with 80 characters per word and 2,000 per meaning.

The 50-word built-in list works offline. Words outside that list use the same-origin `/api/dictionary` endpoint, which sends only the entered word to [Free Dictionary API](https://dictionaryapi.dev/). No names or journals are sent. The service can be unavailable or lack a word; manual meanings remain supported. The hosted lookup endpoint requires the existing login. The local app must have internet access for online lookups; no cloud API key is needed.

Saved words and meanings appear when you revisit the date, in journal text exports, and in JSON backups. Milan backups now use version 4 with a `words` collection for each child; versions 1–3 still restore with empty word collections. Word drafts stay in memory while browsing dates. Save or cancel drafts before exporting/restoring. Neither schema upgrade rewrites production records before a save, and no new SQL migration is needed.

See [BALAJI-IMPROVEMENTS.md](BALAJI-IMPROVEMENTS.md) for the page review and three suggested future additions.

### Health routines

The Health goal now contains four daily checks: Diet, Medicine, Supplements, and Skin care. Each selection saves immediately for its date and is included in Balaji’s JSON backups as the optional `health_checks` collection. Health counts as complete once all four checks are selected. Its card keeps the exact same desktop, tablet and phone dimensions as before.

Older Health completions remain recorded as generic completions and display “Previously complete”; they do not automatically mark any specific routine as done. Once a routine is changed for that day, Health completion follows the four checks. Existing backups without `health_checks` remain supported.

### Balaji’s header field notes

The hero header summarises the selected date’s four main goal statuses and four Health routine statuses. It updates after saves and when selecting another date; it does not create separate records or preselect routines from older generic Health completions.

The header includes 20 vocabulary words with meanings and example sentences. They default to a date-based selection, work offline, and have a button to browse another word. The earlier kind-reminder panel has been removed. These reading aids do not change saved journals or goals. Vocabulary suggests trying the word in the existing Work & learning reflection. The Health card dimensions are unchanged.


### Priority to-dos and date-only navigation

Balaji’s calendar and kind-reminder panel have been removed. The main date picker, Today button, and spending entry-date picker remain synchronised and preserve access to all saved dates. Milan’s calendar is unchanged.

The former “A reminder for the road” section now shows the selected day’s to-do list, generated from the previous day’s saved **Tomorrow’s priority** reflection. Write one task per line (up to 100); leading bullets/numbers are removed and duplicate lines are combined. Checkboxes save automatically. A preview underneath shows what is already planned for tomorrow from the currently selected day’s saved reflection. **Edit the source priority** opens the previous day’s reflection field.

Completions are stored in optional `priority_done` date-keyed arrays in Balaji’s JSON backup. Old backups default to empty completion lists. Editing source task text makes a changed task appear unchecked, rather than assigning an old completion to a different task. The source journals are retained. The Health card’s original widths/heights remain unchanged at desktop, tablet and phone sizes.

### Latest published update

The reviewed daily spending and diesel logs, Milan’s saved words and dictionary lookup, Health routine checkboxes, and priority to-dos were published on 7 November 2026. Balaji now uses date-picker navigation and no longer displays the calendar or kind-reminder panel. Both pages and the dictionary endpoint retain the existing login. No SQL migration was required; existing records upgrade through the validators when read and saved.

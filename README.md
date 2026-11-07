# Little steps activity tracker

A local application for two children, each with editable names, independent daily records, 30-minute Reading, Academics, and Exercise goals, progress rings, and a monthly calendar. No dependencies, external assets, database, or cloud services.

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

Select a child, edit their name, and choose any current or past date. Add 5 or 10 minutes, or enter exact daily totals and select **Save daily minutes**. All successful changes save automatically to disk. Rings cap at the 30-minute goal while totals retain extra minutes. Daily minutes must be nonnegative whole numbers, with at most 1440 minutes total. Future dates cannot be entered.

Use **Export JSON** to download both profiles and all records. **Restore JSON** accepts the same version 1 format, asks before replacing both profiles, validates the entire file, and saves it atomically. Invalid backups leave existing data intact. Export before restoring if you need to retain the previous records.

`data/activities.json` is created on first startup, outside the publicly served `public/` folder. Writes use a temporary file in the same directory, file flush/fsync, atomic replacement, and directory fsync. A corrupt existing JSON file causes startup to fail rather than overwriting it: preserve a copy and repair it or move it aside before starting and restoring an exported backup. The JSON endpoint intentionally supplies records to the local app; filesystem paths are never publicly served.

The folder supplied for this task was empty, so no original `kids-activity.html` design or legacy backup format was available. The included page provides a new rings-and-calendar design. Restores support the documented application schema, not unknown legacy formats.

## Tests

```sh
cd /Users/balajitv/milanbalaji.pro
python3 -m unittest discover -s tests -v
node --check public/app.js
```

Node is optional and only used for JavaScript syntax verification. Tests use temporary storage and a loopback HTTP server; they do not change personal records. They cover saving, server restart, export/restore round trips, invalid restores, separate children, private-file access, and failed atomic writes.

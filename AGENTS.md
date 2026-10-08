# Agent instructions

## Project

This is a Node.js NFL historical matchup research app with local dashboards. Follow the existing CommonJS style and use Node's built-in test runner.

## Testing

- Run the full suite with `npm test`.
- Run focused tests with `node --test test/<name>.test.js`.
- When starting a dashboard for manual or browser testing, always pass the dashboard CLI's `--port` argument so your server does not conflict with the user's server on port 3000. Prefer `--port 0` to have the OS assign a free port, then use the actual URL printed on startup. Use an explicit alternate port when the test needs a fixed URL.
- `--port` is supported by all three dashboard commands, not by `npm test` or the Node test runner:

  ```sh
  npm run dashboard -- --input path/to/snapshot.json --port 0
  npm run game:dashboard -- --season 2026 --game-id 2026_03_PHI_CHI --port 0
  npm run week:dashboard -- --season 2026 --week 3 --port 0
  ```

- Ports must be integers from 0 to 65535. An occupied explicit port causes startup to fail; choose another port rather than stopping the user's server.
- Stop only the dashboard processes you started after testing. Do not kill unrelated servers or processes to free a port.

## Changes

- Preserve existing uncommitted work and avoid unrelated refactoring.
- Add regression tests for behavior changes and run the full suite before reporting completion.
- Keep provider credentials and private raw data out of logs and dashboard responses.

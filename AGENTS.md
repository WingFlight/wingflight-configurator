# Agent notes

## Branches

Name work branches `feature/<name>` with a short, lowercase, hyphenated name
(for example `feature/virtual-fc`). Pushing a `feature/**` branch triggers
`.github/workflows/deploy-web.yml`. That workflow uses the branch name as the
GitHub Pages deploy path and the build label (`VITE_APP_BUILD_LABEL`), so long
names give unwieldy URLs and labels. This matches the firmware repo, where the
branch name goes into the version string and a long one fails the build (see
`wingflight-firmware/AGENTS.md`).

## Never bump version numbers

Agents must not change version numbers. The maintainers bump them manually
when a new version is released. This keeps version changes to a minimum.

Do not touch:

- the `API_VERSION_*` constants, `API_VERSION_WGFL_MIN`,
  `API_VERSION_WGFL_MAX`, `FW_VERSION_WGFL_MIN` or `FW_VERSION_WGFL_MAX` in
  `src/js/configurator.svelte.js`,
- the Virtual firmware versions in `virtualFirmwareVersions`
  (`src/js/utils/common.js`),
- `version` in `package.json`.

Gate new MSP fields on the constant for the upcoming, not yet released API
version. If no such constant exists yet, say so in the PR instead of adding
one.

## Keep the Virtual FC in sync

The Virtual FC ([src/js/virtual_fc.js](src/js/virtual_fc.js)) lets every tab run
without hardware. It does not answer MSP requests. `applyVirtualConfig()` seeds
the `FC` state once on connect. In virtual mode, `MSP.send_message` answers every
read with an empty reply, which leaves `FC` untouched. Only the codes listed in
`getVirtualResponse()` do anything else.

If you change MSP behaviour, update the Virtual FC in the same change:

- **New or changed read (`MSP_*` decoded in `MSPHelper.process_data`)**: seed
  the `FC` fields it fills in `applyVirtualConfig()`. Use the firmware's reset
  defaults (`wingflight-firmware/src/main/pg/*.c`), not zeros. Fixed-size pools
  (mode ranges, mixer rules and curves, gain curves, LED colors, meters) must
  be seeded at their full firmware length, because tabs index into them.
- **New field on an existing `FC` object**: add it to the matching seed or
  profile slot default (`defaultPidSlot()`, `defaultRateSlot()`,
  `defaultTvSlot()`) if the tab reads it.
- **Write with side effects beyond storing `FC`** (profile select, copy,
  reset, or anything whose reply the tab reads directly): handle it in
  `getVirtualResponse()`. Per-profile data lives in the slot arrays there, so
  new per-profile settings must be saved on their `SET_` code and restored on
  select.
- **Reply the tab reads directly** (for example `MSP2_WING_EFFECTIVE_PID_GAINS`):
  encode it in the firmware's wire format and pass it through
  `decodeVirtualReply()`. That way the real decoder fills `FC`, and a format
  mismatch shows up in virtual mode.

Before finishing, connect to the Virtual FC and open the affected tab. Check
that it loads with realistic values, that saving and reloading keeps edits,
and that the console has no errors.

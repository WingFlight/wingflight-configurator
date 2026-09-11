// Reactive state for the Firmware Flasher's backup/restore wizard dialog.
// FirmwareFlasher.svelte's script drives it (runs the actual connect/backup/
// restore work and updates these fields); BackupRestoreWizard.svelte just
// renders it and reports button clicks back via callback props.
export const wizardState = $state({
  phase: null, // null | "backup" | "restore"
  status: "idle", // "connecting" | "running" | "waiting" | "ready" | "done" | "failed"
  backupType: null, // BACKUP_TYPES.DIFF | BACKUP_TYPES.DUMP -- for display only
  backupSaved: false, // did the last "Save Backup File" click actually succeed?
});

export function resetWizard() {
  wizardState.phase = null;
  wizardState.status = "idle";
  wizardState.backupType = null;
  wizardState.backupSaved = false;
}

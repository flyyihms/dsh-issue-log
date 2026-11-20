/**
 * dsh-approval-notify — host half.
 *
 * The host process runs as Electron-as-node, so `require('electron')` is not
 * available here and this half cannot raise a toast or set a taskbar badge.
 * All of that lives in ./client.js, which runs inside the web UI.
 *
 * This half stays registered so the bundle has a host row and so the host-side
 * events can be observed in the console when debugging.
 */
export function apply(ctx, config) {
  try {
    console.log("[approval-notify] host half loaded (notifications are rendered client-side)");
  } catch {
    /* logging only */
  }

  // Observe only: the client half owns the user-visible behavior.
  void ctx;
  void config;
}

export default apply;

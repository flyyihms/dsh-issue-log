/**
 * dsh-approval-notify — client (renderer) module.
 *
 * Runs inside the DSH web UI, where the browser Notification API and the
 * taskbar badge API are available.
 *
 * Behavior:
 *   - an approval panel appearing while the window is in the background
 *     raises a toast; the toast closes as soon as the panel disappears
 *     (approved, rejected or resolved some other way)
 *   - a session going idle in the background raises a toast
 *   - every open toast closes when the window regains focus
 *   - the taskbar badge counts unread notifications and clears when the next
 *     turn starts
 *
 * Front/back detection uses three redundant signals because each can be
 * unreliable on its own inside Electron: document.hasFocus(),
 * document.visibilityState and window focus/blur listeners. Any of them
 * saying "not in front" is enough.
 */
window.__ModuleLoader__.load({
	id: "dsh-approval-notify",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const state = { pending: 0, windowActive: true };
		/** key -> Notification, so we can close them when the cause goes away. */
		const openToasts = new Map();

		function log(message) {
			try {
				console.log(`[approval-notify] ${message}`);
			} catch {}
		}

		/** True when any focus signal says the window is not in front. */
		function backgrounded() {
			try {
				const noFocus = typeof document !== "undefined" && !document.hasFocus();
				const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
				return noFocus || hidden || !state.windowActive;
			} catch {
				return false;
			}
		}

		function updateBadge() {
			try {
				if (typeof navigator === "undefined") return;
				if (state.pending > 0) {
					if (typeof navigator.setAppBadge === "function") {
						navigator.setAppBadge(state.pending).catch((error) => log(`setAppBadge failed: ${error?.message}`));
					} else {
						log("setAppBadge unavailable");
					}
				} else if (typeof navigator.clearAppBadge === "function") {
					navigator.clearAppBadge().catch((error) => log(`clearAppBadge failed: ${error?.message}`));
				}
			} catch (error) {
				log(`badge update threw: ${error?.message}`);
			}
		}

		function closeToast(key) {
			try {
				const toast = openToasts.get(key);
				if (!toast) return;
				openToasts.delete(key);
				toast.close();
			} catch {}
		}

		function closeAllToasts() {
			try {
				for (const key of [...openToasts.keys()]) closeToast(key);
			} catch {}
		}

		function notify(title, body, key) {
			try {
				if (typeof Notification === "undefined") return false;
				if (Notification.permission !== "granted") {
					log(`notification permission=${Notification.permission}`);
					return false;
				}
				closeToast(key);
				const notification = new Notification(title, {
					body,
					tag: key,
					requireInteraction: true,
				});
				openToasts.set(key, notification);
				notification.onclose = () => openToasts.delete(key);
				notification.onclick = () => {
					try {
						window.focus();
					} catch {}
					closeToast(key);
				};
				return true;
			} catch (error) {
				log(`notify failed: ${error?.message}`);
				return false;
			}
		}

		function bump() {
			state.pending += 1;
			updateBadge();
		}

		/** Summarize the mounted approval panel for the notification body. */
		function describeFromPanel(panel) {
			try {
				const text = String(panel?.innerText ?? panel?.textContent ?? "")
					.replace(/\s+/g, " ")
					.trim();
				return text ? text.slice(0, 120) : "有一个操作等待你确认";
			} catch {
				return "有一个操作等待你确认";
			}
		}

		function apply(ctx) {
			try {
				window.addEventListener("focus", () => {
					state.windowActive = true;
					// The user is looking at the app: dismiss whatever was raised.
					closeAllToasts();
					updateBadge();
				});
				window.addEventListener("blur", () => {
					state.windowActive = false;
				});
			} catch {}

			// Approval toasts follow the mounted panel: it appears -> notify,
			// it disappears (approved/rejected/resolved) -> close the toast.
			try {
				let currentKey = null;
				const check = () => {
					try {
						const panel = document.querySelector("[data-approval-key]");
						const key = panel?.getAttribute("data-approval-key") ?? null;
						if (key === currentKey) return;
						if (currentKey !== null) closeToast(`approval:${currentKey}`);
						currentKey = key;
						if (key === null) return;
						if (!backgrounded()) return;
						log(`approval panel appeared: ${key}`);
						const shown = notify("DSH 需要你确认", describeFromPanel(panel), `approval:${key}`);
						if (shown) bump();
					} catch (error) {
						log(`approval watch failed: ${error?.message}`);
					}
				};
				const observer = new MutationObserver(check);
				observer.observe(document.body, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ["data-approval-key"],
				});
				check();
			} catch (error) {
				log(`approval watcher setup failed: ${error?.message}`);
			}

			try {
				ctx.remote.$on("api-session/status", (sessionId, running) => {
					try {
						// Starting a new turn acknowledges the pending notifications.
						if (running === true && state.pending > 0) {
							state.pending = 0;
							updateBadge();
							closeAllToasts();
						}
						if (running === false && backgrounded()) {
							log("session went idle while backgrounded");
							const key = `idle:${sessionId}:${Date.now()}`;
							const shown = notify("DSH 任务已结束", "会话空闲，等待你的下一步", key);
							if (shown) bump();
						}
					} catch {}
				});
			} catch (error) {
				log(`subscribe api-session/status failed: ${error?.message}`);
			}

			log("client plugin applied");
		}

		module.exports.apply = apply;
		module.exports.inject = ["remote"];
		return module.exports;
	},
});

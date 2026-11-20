/**
 * dsh-approval-notify — client (renderer) module.
 *
 * Runs inside the DSH web UI, where the browser Notification API and the
 * taskbar badge API are available. Subscribes to the same remote events the
 * approval composer uses, and only reacts while the window is not in front.
 *
 * Front/back detection uses three redundant signals because each can be
 * unreliable on its own inside Electron:
 *   - document.hasFocus()
 *   - document.visibilityState
 *   - window focus/blur listeners
 * A notification is shown when ANY of them says "not in front".
 */
window.__ModuleLoader__.load({
	id: "dsh-approval-notify",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const state = { pending: 0, windowActive: true };

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

		function notify(title, body) {
			try {
				if (typeof Notification === "undefined") return false;
				if (Notification.permission === "default") {
					Notification.requestPermission().catch(() => {});
				}
				if (Notification.permission !== "granted") {
					log(`notification permission=${Notification.permission}`);
					return false;
				}
				const notification = new Notification(title, {
					body,
					tag: `dsh-${Date.now()}`,
					requireInteraction: true,
				});
				notification.onclick = () => {
					try {
						window.focus();
						notification.close();
					} catch {}
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

		function describe(request) {
			if (!request || typeof request !== "object") return "有一个操作等待你确认";
			const tool = request.toolName ?? request.tool ?? request.kind ?? "工具调用";
			const detail = request.reason ?? request.displayReason ?? request.command ?? "";
			const text = String(detail).replace(/\s+/g, " ").trim();
			return text ? `${tool}: ${text.slice(0, 100)}` : String(tool);
		}

		function apply(ctx) {
			try {
				window.addEventListener("focus", () => {
					state.windowActive = true;
					// Setting the badge while hidden can be dropped; re-apply on return.
					updateBadge();
				});
				window.addEventListener("blur", () => {
					state.windowActive = false;
				});
			} catch {}

			try {
				ctx.remote.$on("approval/request", (request, next) => {
					try {
						if (backgrounded()) {
							log("approval/request while backgrounded");
							const shown = notify("DSH 需要你确认", describe(request));
							if (shown) bump();
						}
					} catch {}
					return next();
				});
			} catch (error) {
				log(`subscribe approval/request failed: ${error?.message}`);
			}

			try {
				ctx.remote.$on("api-session/status", (sessionId, running) => {
					try {
						// Starting a new turn means the user is back and acting:
						// treat it as acknowledging the pending notifications.
						if (running === true && state.pending > 0) {
							state.pending = 0;
							updateBadge();
						}
						if (running === false && backgrounded()) {
							log("session went idle while backgrounded");
							const shown = notify("DSH 任务已结束", "会话空闲，等待你的下一步");
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

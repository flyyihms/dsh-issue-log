/**
 * dsh-notes — client half.
 *
 * Header (corner) outline icon -> right-side drawer with search, grouped notes,
 * and two actions: open the markdown source in the OS default app, and close.
 *
 * Data and the open action come from the host routes /notes/api and /notes/open.
 */
window.__ModuleLoader__.load({
	id: "dsh-notes",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const React = require("react");
		const h = React.createElement;

		const STYLE_ID = "dsh-notes-style";
		const CSS = `
.dshn-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;min-width:28px;padding:0 6px;border-radius:8px;border:1px solid transparent;background:transparent;color:inherit;cursor:pointer;font-size:12px}
.dshn-btn:hover{background:rgba(127,127,127,.16)}
.dshn-count{opacity:.55;font-size:11px;line-height:1}
.dshn-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.22);z-index:2147483000}
.dshn-drawer{position:fixed;top:48px;right:10px;bottom:10px;width:420px;display:flex;flex-direction:column;border:1px solid rgba(127,127,127,.35);border-radius:12px;background:#1f1f23;color:#e9e9ec;box-shadow:-12px 0 40px rgba(0,0,0,.38);z-index:2147483001;font-size:13px;overflow:hidden}
.dshn-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(127,127,127,.2)}
.dshn-head-icon{opacity:.8;display:inline-flex}
.dshn-title{flex:1;font-weight:600;font-size:13px}
.dshn-actions{display:flex;align-items:center;gap:2px}
.dshn-icon{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;border:1px solid transparent;background:transparent;color:inherit;cursor:pointer;opacity:.7}
.dshn-icon:hover{background:rgba(127,127,127,.18);opacity:1}
.dshn-search{padding:10px 14px;border-bottom:1px solid rgba(127,127,127,.15)}
.dshn-input{width:100%;box-sizing:border-box;height:30px;padding:0 10px;border-radius:8px;border:1px solid rgba(127,127,127,.3);background:rgba(255,255,255,.05);color:inherit;font-size:12px;outline:none}
.dshn-input:focus{border-color:rgba(127,127,127,.6)}
.dshn-body{flex:1;overflow:auto;padding:4px 10px 20px}
.dshn-cat{display:flex;align-items:center;gap:6px;margin:14px 4px 4px;font-size:12px;font-weight:600;opacity:.75}
.dshn-cat-count{opacity:.6;font-weight:400}
.dshn-item{display:flex;gap:9px;padding:8px;border-radius:8px}
.dshn-item:hover{background:rgba(127,127,127,.12)}
.dshn-dot{flex:none;width:6px;height:6px;margin-top:6px;border-radius:50%;background:currentColor;opacity:.45}
.dshn-t{font-size:13px;line-height:1.4}
.dshn-d{font-size:11px;opacity:.4;margin-top:2px}
.dshn-b{font-size:12px;opacity:.62;margin-top:4px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dshn-empty{padding:28px 16px;text-align:center;opacity:.55;font-size:12px}
`;

		function ensureStyles() {
			try {
				if (document.getElementById(STYLE_ID)) return;
				const style = document.createElement("style");
				style.id = STYLE_ID;
				style.textContent = CSS;
				document.head.appendChild(style);
			} catch {
				/* styling is best effort */
			}
		}

		function Icon({ children, size = 16 }) {
			return h(
				"svg",
				{
					width: size,
					height: size,
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.8,
					strokeLinecap: "round",
					strokeLinejoin: "round",
				},
				children,
			);
		}

		const NotebookIcon = (props) =>
			h(
				Icon,
				props,
				h("path", { d: "M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" }),
				h("path", { d: "M9 3v18" }),
				h("path", { d: "M12 8h4M12 12h4M12 16h2" }),
			);

		const FolderIcon = (props) =>
			h(
				Icon,
				{ ...props, size: 14 },
				h("path", { d: "M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" }),
			);

		const OpenIcon = (props) =>
			h(
				Icon,
				{ ...props, size: 15 },
				h("path", { d: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" }),
				h("path", { d: "M14 3v5h5" }),
			);

		const CloseIcon = (props) =>
			h(Icon, { ...props, size: 15 }, h("path", { d: "M6 6l12 12M18 6L6 18" }));

		function matches(entry, query) {
			if (!query) return true;
			const needle = query.toLowerCase();
			return `${entry.title}\n${entry.body ?? ""}`.toLowerCase().includes(needle);
		}

		function NotesDrawer({ onClose }) {
			const [state, setState] = React.useState({ status: "loading", data: null, error: "" });
			const [query, setQuery] = React.useState("");

			React.useEffect(() => {
				let alive = true;
				(async () => {
					try {
						const response = await fetch("/notes/api", { headers: { accept: "application/json" } });
						if (!response.ok) throw new Error(`HTTP ${response.status}`);
						const data = await response.json();
						if (alive) setState({ status: "ready", data, error: "" });
					} catch (error) {
						if (alive) setState({ status: "error", data: null, error: error?.message ?? String(error) });
					}
				})();
				return () => {
					alive = false;
				};
			}, []);

			React.useEffect(() => {
				const onKey = (event) => {
					if (event.key === "Escape") onClose();
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [onClose]);

			const openSource = async () => {
				try {
					await fetch("/notes/open", { method: "POST" });
				} catch {
					/* the OS may refuse; nothing to recover here */
				}
			};

			let content;
			if (state.status !== "ready") {
				content = h("div", { className: "dshn-empty" }, state.status === "error" ? `读取失败：${state.error}` : "加载中…");
			} else if (!state.data.exists) {
				content = h("div", { className: "dshn-empty" }, `还没有笔记文件：${state.data.path}`);
			} else {
				const categories = state.data.categories
					.map((category) => ({ ...category, entries: category.entries.filter((entry) => matches(entry, query)) }))
					.filter((category) => category.entries.length > 0);
				content =
					categories.length === 0
						? h("div", { className: "dshn-empty" }, query ? "没有匹配的笔记" : "笔记是空的")
						: categories.map((category) =>
								h(
									"div",
									{ key: category.name },
									h(
										"div",
										{ className: "dshn-cat" },
										h(FolderIcon),
										category.name,
										h("span", { className: "dshn-cat-count" }, `（${category.entries.length}）`),
									),
									category.entries.map((entry, index) =>
										h(
											"div",
											{ key: `${category.name}-${index}`, className: "dshn-item" },
											h("div", { className: "dshn-dot" }),
											h(
												"div",
												null,
												h("div", { className: "dshn-t" }, entry.title),
												entry.date ? h("div", { className: "dshn-d" }, entry.date) : null,
												entry.body ? h("div", { className: "dshn-b" }, entry.body) : null,
											),
										),
									),
								),
							);
			}

			return h(
				React.Fragment,
				null,
				h("div", { className: "dshn-backdrop", onClick: onClose }),
				h(
					"div",
					{ className: "dshn-drawer", "data-notes-panel": "1" },
					h(
						"div",
						{ className: "dshn-head" },
						h("span", { className: "dshn-head-icon" }, h(NotebookIcon, { size: 15 })),
						h("div", { className: "dshn-title" }, "笔记"),
						h(
							"div",
							{ className: "dshn-actions" },
							h("button", { type: "button", className: "dshn-icon", onClick: openSource, title: "打开 md 源文件" }, h(OpenIcon)),
							h("button", { type: "button", className: "dshn-icon", onClick: onClose, title: "收起" }, h(CloseIcon)),
						),
					),
					h(
						"div",
						{ className: "dshn-search" },
						h("input", {
							className: "dshn-input",
							placeholder: "搜索笔记…",
							value: query,
							autoFocus: true,
							onChange: (event) => setQuery(event.target.value),
						}),
					),
					h("div", { className: "dshn-body" }, content),
				),
			);
		}

		function NotesEntry() {
			const [open, setOpen] = React.useState(false);

			return h(
				React.Fragment,
				null,
				h(
					"button",
					{ type: "button", className: "dshn-btn", onClick: () => setOpen(true), title: "笔记" },
					h(NotebookIcon),
				),
				open ? h(NotesDrawer, { onClose: () => setOpen(false) }) : null,
			);
		}

		/** Ship a short diagnostic line to the host log. */
		function report(message) {
			try {
				fetch("/notes/log", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ message: String(message) }),
				}).catch(() => {});
			} catch {
				/* diagnostics only */
			}
		}

		function registerIn(ctx, slotName, id) {
			return ctx.slots.inject(slotName, () => {
				report(`inject ran for ${slotName}`);
				try {
					const disposer = ctx.slots.register({ name: slotName, id, order: 30 }, NotesEntry);
					report(`registered in ${slotName}`);
					return disposer;
				} catch (error) {
					report(`register failed in ${slotName}: ${error?.stack ?? error?.message ?? error}`);
					throw error;
				}
			});
		}

		function apply(ctx) {
			ensureStyles();
			report("client apply called");

			// `conversation.session.header.corner` is a single-slot owned by the
			// right sidebar toggle, so we join the utilities list instead; it
			// sits next to the corner without displacing another plugin.
			const slotName = "conversation.session.header.utilities";
			try {
				ctx.slots.inject(slotName, () => {
					report(`inject ran for ${slotName}`);
					try {
						const disposer = ctx.slots.register({ name: slotName, id: "notes-entry", order: 30 }, NotesEntry);
						report(`registered in ${slotName}`);
						return disposer;
					} catch (error) {
						report(`register failed in ${slotName}: ${error?.stack ?? error?.message ?? error}`);
					}
				});
			} catch (error) {
				report(`inject threw for ${slotName}: ${error?.message ?? error}`);
			}

			console.log("[notes] client plugin applied");
		}

		module.exports.apply = apply;
		module.exports.inject = ["slots"];
		return module.exports;
	},
});

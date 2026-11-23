/**
 * dsh-recall — client half.
 *
 * Header (utilities) magnifier -> right-side drawer with two segmented tabs:
 *   - 笔记 : grouped notes, local filter, "open source file"
 *   - 全局 : full-text search across stored sessions, role filter,
 *            click a hit to read its surrounding messages in place
 *
 * Data comes from the host routes /notes/api, /notes/search, /notes/context
 * and /notes/open.
 */
window.__ModuleLoader__.load({
	id: "dsh-recall",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const React = require("react");
		const h = React.createElement;

		const STYLE_ID = "dsh-recall-style";
		const CSS = `
.dshn-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;min-width:28px;padding:0 6px;border-radius:8px;border:1px solid transparent;background:transparent;color:inherit;cursor:pointer;font-size:12px}
.dshn-btn:hover{background:rgba(127,127,127,.16)}
.dshn-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.22);z-index:2147483000}
.dshn-drawer{position:fixed;top:48px;right:10px;bottom:10px;width:440px;display:flex;flex-direction:column;border:1px solid rgba(127,127,127,.35);border-radius:12px;background:#1f1f23;color:#e9e9ec;box-shadow:-12px 0 40px rgba(0,0,0,.38);z-index:2147483001;font-size:13px;overflow:hidden}
.dshn-head{display:flex;align-items:center;gap:8px;padding:12px 14px 8px}
.dshn-head-icon{opacity:.8;display:inline-flex}
.dshn-title{flex:1;font-weight:600;font-size:13px}
.dshn-actions{display:flex;align-items:center;gap:2px}
.dshn-icon{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;border:1px solid transparent;background:transparent;color:inherit;cursor:pointer;opacity:.7}
.dshn-icon:hover{background:rgba(127,127,127,.18);opacity:1}
.dshn-seg{display:flex;gap:2px;padding:2px;border-radius:8px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.06)}
.dshn-seg button{flex:1 1 0;min-width:0;height:26px;padding:0 8px;border:none;border-radius:6px;background:transparent;color:inherit;font-size:12px;line-height:1;cursor:pointer;opacity:.62;transition:background .18s ease,opacity .18s ease,box-shadow .18s ease;white-space:nowrap}
.dshn-seg button:hover{opacity:.85}
.dshn-seg button.on{background:#1668dc;color:#fff;opacity:1;box-shadow:0 1px 3px rgba(22,104,220,.45)}
.dshn-search{padding:10px 14px;border-bottom:1px solid rgba(127,127,127,.15)}
.dshn-input{width:100%;box-sizing:border-box;height:30px;padding:0 10px;border-radius:8px;border:1px solid rgba(127,127,127,.3);background:rgba(255,255,255,.05);color:inherit;font-size:12px;outline:none}
.dshn-input:focus{border-color:#1668dc;box-shadow:0 0 0 2px rgba(22,104,220,.18)}
.dshn-body{flex:1;overflow:auto;padding:4px 10px 20px}
.dshn-cat{display:flex;align-items:center;gap:6px;margin:14px 4px 4px;font-size:12px;font-weight:600;opacity:.75}
.dshn-cat-count{opacity:.6;font-weight:400}
.dshn-item{display:flex;gap:9px;padding:8px;border-radius:8px}
.dshn-item:hover{background:rgba(127,127,127,.12)}
.dshn-dot{flex:none;width:6px;height:6px;margin-top:6px;border-radius:50%;background:currentColor;opacity:.45}
.dshn-t{font-size:13px;line-height:1.4}
.dshn-mark{background:rgba(255,200,60,.32);color:inherit;border-radius:3px;padding:0 1px;box-shadow:inset 0 -1px 0 rgba(255,200,60,.5)}
.dshn-d{font-size:11px;opacity:.4;margin-top:2px}
.dshn-b{font-size:12px;opacity:.62;margin-top:4px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dshn-empty{padding:28px 16px;text-align:center;opacity:.55;font-size:12px}
.dshn-meta{padding:8px 6px;font-size:11px;opacity:.5}
.dshn-filter{margin-top:8px}
.dshn-hit{cursor:pointer}
.dshn-hit.open{background:rgba(127,127,127,.1)}
.dshn-full{margin-top:6px;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;opacity:.85;max-height:320px;overflow:auto}
.dshn-context{margin-top:8px;border-left:2px solid rgba(127,127,127,.25);padding-left:10px}
.dshn-msg{margin:8px 0;font-size:12px;line-height:1.55;opacity:.8}
.dshn-msg.hit{opacity:1;background:rgba(255,214,102,.12);border-radius:6px;padding:6px 8px;margin-left:-6px}
.dshn-msg-role{font-size:10px;opacity:.55;margin-bottom:2px}
.dshn-msg-text{white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto}
.dshn-hit-actions{display:flex;gap:8px;margin-top:8px}
.dshn-hit-actions button{padding:3px 10px;border-radius:6px;border:1px solid rgba(127,127,127,.3);background:rgba(255,255,255,.04);color:inherit;font-size:11px;cursor:pointer;opacity:.75}
.dshn-hit-actions button:hover{opacity:1;background:rgba(255,255,255,.09)}
`;

		function ensureStyles() {
			try {
				// Always overwrite: a hot re-apply keeps the previous <style>
				// element in the DOM, and the new class names would otherwise
				// render unstyled.
				let style = document.getElementById(STYLE_ID);
				if (!style) {
					style = document.createElement("style");
					style.id = STYLE_ID;
					document.head.appendChild(style);
				}
				if (style.textContent !== CSS) style.textContent = CSS;
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

		const SearchIcon = (props) =>
			h(Icon, props, h("circle", { cx: 11, cy: 11, r: 7 }), h("path", { d: "m20 20-3.6-3.6" }));

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

		/** Split text on every case-insensitive occurrence of `query`. */
		function highlight(text, query) {
			if (!query) return text;
			const needle = query.toLowerCase();
			const lower = String(text).toLowerCase();
			const parts = [];
			let at = 0;
			let index = lower.indexOf(needle);
			while (index >= 0) {
				if (index > at) parts.push(String(text).slice(at, index));
				parts.push(h("mark", { key: `m${index}`, className: "dshn-mark" }, String(text).slice(index, index + needle.length)));
				at = index + needle.length;
				index = lower.indexOf(needle, at);
			}
			if (at < String(text).length) parts.push(String(text).slice(at));
			return parts;
		}

		function useNotes() {
			const [state, setState] = React.useState({ status: "loading", data: null, error: "" });
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
			return state;
		}

		function NotesTab({ notes, query, setQuery, onOpenSource }) {
			let content;
			if (notes.status !== "ready") {
				content = h("div", { className: "dshn-empty" }, notes.status === "error" ? `读取失败：${notes.error}` : "加载中…");
			} else if (!notes.data.exists) {
				content = h("div", { className: "dshn-empty" }, `还没有笔记文件：${notes.data.path}`);
			} else {
				const categories = notes.data.categories
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
				h(
					"div",
					{ className: "dshn-search" },
					h("input", {
						className: "dshn-input",
						placeholder: "搜索笔记…",
						value: query,
						onChange: (event) => setQuery(event.target.value),
					}),
				),
				h(
					"div",
					{ className: "dshn-body" },
					notes.status === "ready" && notes.data.exists
						? h(
								"div",
								{ className: "dshn-meta" },
								`${notes.data.path}${notes.data.updatedAt ? ` · ${notes.data.updatedAt.slice(0, 19).replace("T", " ")}` : ""}`,
								h(
									"button",
									{
										type: "button",
										className: "dshn-icon",
										style: { marginLeft: 8, verticalAlign: "middle" },
										onClick: onOpenSource,
										title: "打开 md 源文件",
									},
									h(OpenIcon),
								),
							)
						: null,
					content,
				),
			);
		}

		function SearchTab() {
			const [query, setQuery] = React.useState("");
			const [role, setRole] = React.useState("all");
			const [expanded, setExpanded] = React.useState(-1);
			const [contexts, setContexts] = React.useState({});
			const [state, setState] = React.useState({ status: "idle", data: null, error: "" });

			const loadContext = async (hit) => {
				const key = `${hit.session}:${hit.seq}`;
				if (contexts[key]) return;
				setContexts((prev) => ({ ...prev, [key]: { status: "loading" } }));
				try {
					const response = await fetch(
						`/notes/context?session=${encodeURIComponent(hit.session)}&seq=${hit.seq}&around=3`,
					);
					const data = await response.json();
					setContexts((prev) => ({
						...prev,
						[key]: response.ok
							? { status: "ready", data }
							: { status: "error", error: data?.error ?? `HTTP ${response.status}` },
					}));
				} catch (error) {
					setContexts((prev) => ({ ...prev, [key]: { status: "error", error: error?.message ?? String(error) } }));
				}
			};

			const toggle = (hit, index) => {
				const next = expanded === index ? -1 : index;
				setExpanded(next);
				if (next === index) loadContext(hit);
			};

			const run = async (nextRole = role) => {
				const q = query.trim();
				if (!q) return;
				setExpanded(-1);
				setState({ status: "loading", data: null, error: "" });
				try {
					const response = await fetch(
						`/notes/search?q=${encodeURIComponent(q)}&limit=20&role=${encodeURIComponent(nextRole)}`,
					);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const data = await response.json();
					setState({ status: "ready", data, error: "" });
				} catch (error) {
					setState({ status: "error", data: null, error: error?.message ?? String(error) });
				}
			};

			const pickRole = (next) => {
				setRole(next);
				if (state.status === "ready" || state.status === "error") run(next);
			};

			let content;
			if (state.status === "idle") {
				content = h("div", { className: "dshn-empty" }, "输入关键词，搜索所有历史对话（含子会话）");
			} else if (state.status === "loading") {
				content = h("div", { className: "dshn-empty" }, "搜索中…（首次需要解压历史会话，可能要几秒）");
			} else if (state.status === "error") {
				content = h("div", { className: "dshn-empty" }, `搜索失败：${state.error}`);
			} else if (!state.data.results.length) {
				content = h("div", { className: "dshn-empty" }, `没有找到「${state.data.query}」`);
			} else {
				content = [
					h("div", { key: "meta", className: "dshn-meta" }, `命中 ${state.data.hits} 处，扫描 ${state.data.scanned} 个会话`),
					...state.data.results.map((hit, index) => {
						const isOpen = expanded === index;
						const key = `${hit.session}:${hit.seq}`;
						const detail = contexts[key];
						return h(
							"div",
							{
								key: `${hit.session}-${index}`,
								className: `dshn-item dshn-hit${isOpen ? " open" : ""}`,
								onClick: () => toggle(hit, index),
								title: isOpen ? "点击收起" : "点击查看上下文",
							},
							h("div", { className: "dshn-dot" }),
							h(
								"div",
								{ style: { minWidth: 0 } },
								h("div", { className: "dshn-t" }, isOpen ? "" : highlight(hit.snippet, state.data.query)),
								h(
									"div",
									{ className: "dshn-d" },
									`${hit.role === "user" ? "我" : "助手"} · ${hit.time ? hit.time.slice(0, 19).replace("T", " ") : "无时间"} · ${hit.cwd || "未知目录"}`,
								),
								isOpen
									? detail?.status === "ready"
										? h(
												"div",
												{ className: "dshn-context" },
												detail.data.messages.map((message) =>
													h(
														"div",
														{
															key: message.seq,
															className: `dshn-msg${message.hit ? " hit" : ""}`,
														},
														h(
															"div",
															{ className: "dshn-msg-role" },
															`${message.role === "user" ? "我" : "助手"} · ${message.time ? message.time.slice(0, 19).replace("T", " ") : ""}`,
														),
														h(
															"div",
															{ className: "dshn-msg-text" },
															message.hit ? highlight(message.text, state.data.query) : message.text,
														),
													),
												),
											)
										: detail?.status === "error"
											? h("div", { className: "dshn-empty" }, `上下文加载失败：${detail.error}`)
											: h("div", { className: "dshn-empty" }, "加载上下文…")
									: null,
								isOpen
									? h(
											"div",
											{ className: "dshn-hit-actions" },
											h(
												"button",
												{
													type: "button",
													onClick: (event) => {
														event.stopPropagation();
														navigator.clipboard?.writeText(hit.text || hit.snippet);
													},
												},
												"复制全文",
											),
											h(
												"button",
												{
													type: "button",
													onClick: (event) => {
														event.stopPropagation();
														navigator.clipboard?.writeText(
															`${hit.session} · seq ${hit.seq} · ${hit.time} · ${hit.cwd}`,
														);
													},
												},
												"复制定位",
											),
										)
									: null,
							),
						);
					}),
				];
			}

			return h(
				React.Fragment,
				null,
				h(
					"div",
					{ className: "dshn-search" },
					h("input", {
						className: "dshn-input",
						placeholder: "搜索历史对话…（回车）",
						value: query,
						autoFocus: true,
						onChange: (event) => setQuery(event.target.value),
						onKeyDown: (event) => {
							if (event.key === "Enter") run();
						},
					}),
					h(
						"div",
						{ className: "dshn-seg dshn-filter" },
						["all", "user", "assistant"].map((key) =>
							h(
								"button",
								{
									key,
									type: "button",
									className: role === key ? "on" : "",
									onClick: () => pickRole(key),
								},
								key === "all" ? "全部" : key === "user" ? "我" : "助手",
							),
						),
					),
				),
				h("div", { className: "dshn-body" }, content),
			);
		}

		function NotesDrawer({ onClose }) {
			const [tab, setTab] = React.useState("notes");
			const [noteQuery, setNoteQuery] = React.useState("");
			const notes = useNotes();

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
					/* the OS may refuse */
				}
			};

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
						h("span", { className: "dshn-head-icon" }, h(SearchIcon, { size: 15 })),
						h("div", { className: "dshn-title" }, "搜索"),
						h(
							"div",
							{ className: "dshn-actions" },
							tab === "notes"
								? h("button", { type: "button", className: "dshn-icon", onClick: openSource, title: "打开 md 源文件" }, h(OpenIcon))
								: null,
							h("button", { type: "button", className: "dshn-icon", onClick: onClose, title: "收起" }, h(CloseIcon)),
						),
					),
					h(
						"div",
						{ className: "dshn-seg", style: { margin: "0 14px 10px" }, role: "tablist" },
						h(
							"button",
							{
								type: "button",
								role: "tab",
								"aria-selected": tab === "notes",
								className: tab === "notes" ? "on" : "",
								onClick: () => setTab("notes"),
							},
							"笔记",
						),
						h(
							"button",
							{
								type: "button",
								role: "tab",
								"aria-selected": tab === "search",
								className: tab === "search" ? "on" : "",
								onClick: () => setTab("search"),
							},
							"全局",
						),
					),
					tab === "notes"
						? h(NotesTab, { notes, query: noteQuery, setQuery: setNoteQuery, onOpenSource: openSource })
						: h(SearchTab),
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
					{ type: "button", className: "dshn-btn", onClick: () => setOpen(true), title: "笔记与全局搜索" },
					h(SearchIcon),
				),
				open ? h(NotesDrawer, { onClose: () => setOpen(false) }) : null,
			);
		}

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

		function apply(ctx) {
			ensureStyles();
			report("client apply called");
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
			console.log("[recall] client plugin applied");
		}

		module.exports.apply = apply;
		module.exports.inject = ["slots"];
		return module.exports;
	},
});

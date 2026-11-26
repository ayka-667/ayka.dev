/* ayka.dev API — Cloudflare Worker + D1
 *
 *   GET    /stats            visitor count
 *   POST   /visit            count this visitor (once per day per visitor, IPs are never stored, only a salted hash)
 *   GET    /history          last tracks I listened to (recorded every minute by the cron below, from Lanyard)
 *   GET    /guestbook        latest messages
 *   POST   /guestbook        { name, msg }  — rate-limited, no links, length-capped
 *   DELETE /guestbook/:id    hide a message (header  X-Admin-Key: <ADMIN_KEY secret>)
 *   POST   /guestbook/:id/pin    pin / unpin a message ({ pinned: true|false }, same header)
 */

const DISCORD_ID = "1198196468272603196";
const ORIGINS = ["https://ayka.dev", "https://www.ayka.dev", "http://localhost:8765", "http://127.0.0.1:8765"];
const HISTORY_KEEP = 5;
const BOOK_PAGE = 25;

export default {
	async fetch(req, env, ctx) {
		const url = new URL(req.url);
		const origin = req.headers.get("Origin") || "";
		const cors = {
			"Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
			"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
			"Access-Control-Max-Age": "86400",
			"Vary": "Origin",
		};
		const json = (data, status = 200, extra = {}) =>
			new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors, ...extra } });

		if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

		try {
			const path = url.pathname.replace(/\/+$/, "") || "/";

			if (path === "/stats" && req.method === "GET") {
				return json({ visitors: await counter(env, "visitors") }, 200, { "Cache-Control": "public, max-age=30" });
			}

			if (path === "/visit" && req.method === "POST") {
				if (!ORIGINS.includes(origin)) return json({ error: "origin" }, 403);
				const day = new Date().toISOString().slice(0, 10);
				const h = await hash(env, ip(req) + "|" + day);
				const r = await env.DB.prepare("INSERT OR IGNORE INTO visits (hash, day) VALUES (?, ?)").bind(h, day).run();
				if (r.meta.changes) {
					await env.DB.prepare("INSERT INTO counters (name, value) VALUES ('visitors', 1) ON CONFLICT(name) DO UPDATE SET value = value + 1").run();
				}
				return json({ visitors: await counter(env, "visitors"), counted: !!r.meta.changes });
			}

			if (path === "/history" && req.method === "GET") {
				/* don't rely on the cron alone: check Lanyard here too, at most every 45 s */
				const lc = await env.DB.prepare("SELECT value FROM counters WHERE name = 'lastcheck'").first();
				if (!lc || Date.now() - lc.value > 45_000) {
					await env.DB.prepare("INSERT INTO counters (name, value) VALUES ('lastcheck', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value").bind(Date.now()).run();
					await Promise.race([recordTrack(env).catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
				}
				const { results } = await env.DB.prepare(
					"SELECT title, artist, album, art, app, link, started, seen FROM tracks ORDER BY seen DESC LIMIT " + HISTORY_KEEP
				).all();
				return json({ tracks: results }, 200, { "Cache-Control": "no-store" });
			}

			if (path === "/guestbook" && req.method === "GET") {
				/* pinned messages first (always shown), then the latest ones */
				const pinned = await env.DB.prepare(
					"SELECT id, name, msg, at, 1 AS pinned FROM guestbook WHERE hidden = 0 AND pinned > 0 ORDER BY pinned DESC"
				).all();
				const latest = await env.DB.prepare(
					"SELECT id, name, msg, at, 0 AS pinned FROM guestbook WHERE hidden = 0 AND pinned = 0 ORDER BY at DESC LIMIT ?"
				).bind(BOOK_PAGE).all();
				return json({ messages: pinned.results.concat(latest.results) }, 200, { "Cache-Control": "no-store" });
			}

			if (path === "/guestbook" && req.method === "POST") {
				if (!ORIGINS.includes(origin)) return json({ error: "origin" }, 403);
				let body;
				try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
				if (body.website) return json({ ok: true }); /* honeypot: bots fill every field */
				const name = clean(body.name, 24) || "anon";
				const isAdmin = !!env.ADMIN_KEY && req.headers.get("X-Admin-Key") === env.ADMIN_KEY;
				if (!isAdmin && reservedName(name)) return json({ error: "this name is reserved, pick another one" }, 400);
				const msg = clean(body.msg, 200);
				if (!msg || msg.length < 2) return json({ error: "message too short" }, 400);
				if (/(https?:\/\/|www\.|discord\.gg|\.(com|net|org|io|gg|xyz|ru)\b)/i.test(name + " " + msg)) return json({ error: "no links please" }, 400);
				if (BAD.test(name + " " + msg)) return json({ error: "keep it friendly" }, 400);

				const who = await hash(env, "gb|" + ip(req));
				const now = Date.now();
				const last = await env.DB.prepare("SELECT at FROM guestbook WHERE iphash = ? ORDER BY id DESC LIMIT 1").bind(who).first();
				if (last && now - last.at < 60_000) return json({ error: "slow down, try again in a minute" }, 429);
				const today = await env.DB.prepare("SELECT COUNT(*) AS n FROM guestbook WHERE iphash = ? AND at > ?").bind(who, now - 86_400_000).first();
				if (today && today.n >= 5) return json({ error: "that's enough for today :)" }, 429);
				const dup = await env.DB.prepare("SELECT id FROM guestbook WHERE msg = ? AND at > ?").bind(msg, now - 3_600_000).first();
				if (dup) return json({ error: "already posted" }, 409);

				const r = await env.DB.prepare("INSERT INTO guestbook (name, msg, at, iphash) VALUES (?, ?, ?, ?)").bind(name, msg, now, who).run();
				return json({ message: { id: r.meta.last_row_id, name, msg, at: now } }, 201);
			}

			const pin = path.match(/^\/guestbook\/(\d+)\/pin$/);
			if (pin && req.method === "POST") {
				if (!env.ADMIN_KEY || req.headers.get("X-Admin-Key") !== env.ADMIN_KEY) return json({ error: "forbidden" }, 403);
				let on = true;
				try { on = (await req.json()).pinned !== false; } catch {}
				await env.DB.prepare("UPDATE guestbook SET pinned = ? WHERE id = ?").bind(on ? Date.now() : 0, +pin[1]).run();
				return json({ ok: true, pinned: on });
			}

			const del = path.match(/^\/guestbook\/(\d+)$/);
			if (del && req.method === "DELETE") {
				if (!env.ADMIN_KEY || req.headers.get("X-Admin-Key") !== env.ADMIN_KEY) return json({ error: "forbidden" }, 403);
				await env.DB.prepare("UPDATE guestbook SET hidden = 1 WHERE id = ?").bind(+del[1]).run();
				return json({ ok: true });
			}

			if (path === "/") return json({ ok: true, endpoints: ["/stats", "/visit", "/history", "/guestbook"] });
			return json({ error: "not found" }, 404);
		} catch (e) {
			return json({ error: "server error" }, 500);
		}
	},

	/* every minute: note what I'm listening to; once a day: forget old visit hashes */
	async scheduled(event, env, ctx) {
		ctx.waitUntil(recordTrack(env).then(() =>
			env.DB.prepare("INSERT INTO counters (name, value) VALUES ('lastcheck', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value").bind(Date.now()).run()));
		if (event.cron === "0 4 * * *" || new Date().getUTCMinutes() === 0) {
			const day = new Date().toISOString().slice(0, 10);
			ctx.waitUntil(env.DB.prepare("DELETE FROM visits WHERE day < ?").bind(day).run());
		}
	},
};

/* ---------- helpers ---------- */

/* names only I can use (when posting with the admin key). Checked after folding case, accents,
   look-alike letters, leetspeak and separators, so "A y k a", "4yk4", "Аyka" (cyrillic), "steam_tools" are caught too. */
const RESERVED = ["ayka", "steamtools", "steamtool", "yourstake", "admin", "administrator", "moderator", "owner", "staff", "official", "support"];
const LOOKALIKE = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "к": "k", "х": "x", "і": "i", "ѕ": "s", "т": "t", "м": "m", "ı": "i", "ʏ": "y", "ᴀ": "a", "ᴋ": "k" };
const LEET = { "4": "a", "@": "a", "3": "e", "1": "i", "!": "i", "|": "i", "0": "o", "5": "s", "$": "s", "7": "t", "¥": "y" };
function foldName(s) {
	let t = String(s).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
	t = [...t].map((c) => LOOKALIKE[c] || LEET[c] || c).join("");
	return t.replace(/[^a-z]/g, "").replace(/(.)\1+/g, "$1");
}
function reservedName(name) {
	const f = foldName(name);
	return RESERVED.some((r) => f.includes(r.replace(/(.)\1+/g, "$1")));
}

const BAD = /\b(n[i1]gg|f[a@]gg?ot|p[eé]d[eé]s?\b|encul[ée]|nazi|hitler|kys|kill yourself|suicide|sale (arabe|noir|juif))/i;

function ip(req) {
	return req.headers.get("CF-Connecting-IP") || "0.0.0.0";
}

async function hash(env, s) {
	const data = new TextEncoder().encode((env.ADMIN_KEY || "salt") + "|" + s);
	const d = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clean(s, max) {
	return String(s || "")
		.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, max);
}

async function counter(env, name) {
	const row = await env.DB.prepare("SELECT value FROM counters WHERE name = ?").bind(name).first();
	return row ? row.value : 0;
}

/* same rules as the site: Spotify, or a "listening" activity such as Liner */
function currentTrack(p) {
	if (!p) return null;
	if (p.listening_to_spotify && p.spotify) {
		const s = p.spotify;
		return {
			title: s.song, artist: (s.artist || "").split(";")[0].trim(), album: s.album || "",
			art: s.album_art_url || "", app: "spotify",
			link: s.track_id ? "https://open.spotify.com/track/" + s.track_id : "",
			started: (s.timestamps && s.timestamps.start) || 0,
		};
	}
	const a = (p.activities || []).find((x) => x.type === 2 && x.details);
	if (!a) return null;
	const as = a.assets || {};
	let art = "", link = "";
	const l = as.large_image || "";
	if (l.startsWith("mp:external/")) art = "https://media.discordapp.net/external/" + l.slice(12);
	else if (l.startsWith("spotify:")) art = "https://i.scdn.co/image/" + l.slice(8);
	else if (l && a.application_id) art = "https://cdn.discordapp.com/app-assets/" + a.application_id + "/" + l + ".png";
	const yt = decodeURIComponent(l).match(/ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//);
	if (yt) link = "https://music.youtube.com/watch?v=" + yt[1];
	const btn = (a.buttons || []).map((x) => (typeof x === "string" ? x : x.label || "")).find((x) => /^listen on /i.test(x));
	const app = btn ? btn.replace(/^listen on /i, "").toLowerCase() : a.name && a.name !== a.state ? a.name.toLowerCase() : "";
	return {
		title: a.details, artist: a.state || "", album: as.large_text || "", art, app, link,
		started: (a.timestamps && a.timestamps.start) || 0,
	};
}

async function recordTrack(env) {
	const r = await fetch("https://api.lanyard.rest/v1/users/" + DISCORD_ID, { headers: { "User-Agent": "ayka.dev-history" } });
	if (!r.ok) return;
	const j = await r.json();
	const t = currentTrack(j && j.data);
	if (!t || !t.title) return;
	const now = Date.now();
	const last = await env.DB.prepare("SELECT id, title, artist, started, seen FROM tracks ORDER BY id DESC LIMIT 1").first();
	/* same song still playing (or paused a bit): just refresh "seen" */
	if (last && last.title === t.title && last.artist === t.artist && (now - last.seen < 8 * 60_000 || (t.started && t.started === last.started))) {
		await env.DB.prepare("UPDATE tracks SET seen = ? WHERE id = ?").bind(now, last.id).run();
		return;
	}
	await env.DB.prepare("INSERT INTO tracks (title, artist, album, art, app, link, started, seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
		.bind(t.title.slice(0, 200), t.artist.slice(0, 200), t.album.slice(0, 200), t.art.slice(0, 500), t.app.slice(0, 40), t.link.slice(0, 300), t.started || now, now)
		.run();
	await env.DB.prepare("DELETE FROM tracks WHERE id NOT IN (SELECT id FROM tracks ORDER BY id DESC LIMIT ?)").bind(HISTORY_KEEP).run();
}

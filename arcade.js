(function(){
/* ayka arcade: loaded on demand when the secret code is typed. Everything is drawn as text, all sound is synthesized. */
"use strict";

var root = document.getElementById("game"), cv = document.getElementById("game-cv"), ctx = cv.getContext("2d");
var FONT = '"JetBrains Mono","Cascadia Mono",Consolas,Menlo,monospace';
var C = { bg: "#010203", fg: "#c9d1d9", hi: "#f0f6fc", dim: "#6e7681", line: "#2d333b", green: "#7ee787", blue: "#79c0ff",
	purple: "#d2a8ff", red: "#ff7b72", yellow: "#e3b341", orange: "#ffa657", faint: "#1c2128", mid: "#3b434c" };

function load(k, d){ try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e){ return d; } }
function save(k, v){ try { localStorage.setItem(k, v); } catch (e){} }
var GLOW = (navigator.hardwareConcurrency || 8) > 4 && load("ayka-lite", "") !== "1";
var REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;

function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
function rnd(a, b){ return a + Math.random() * (b - a); }
function irnd(a, b){ return Math.floor(rnd(a, b + 1)); }
function pick(a){ return a[Math.floor(Math.random() * a.length)]; }
function pad(n, l){ return ("0000000000" + Math.floor(n)).slice(-l); }
function rep(s, n){ return n > 0 ? new Array(Math.floor(n) + 1).join(s) : ""; }
var SUFFIX = ["", "k", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
function fmt(n){
	if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : String(Math.floor(n));
	var i = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3));
	var v = n / Math.pow(1000, i);
	return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + SUFFIX[i];
}

/* ================= sound ================= */
var AC = null, master, sfxBus, musIn, musBus, NB, LFO, muted = load("ayka-game-mute", "0") === "1";
function audio(){
	if (!AC){
		AC = window.__aykaAC || null;
		var A = window.AudioContext || window.webkitAudioContext;
		if (!AC && A) AC = new A();
		if (!AC) return;
		master = AC.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(AC.destination);
		sfxBus = AC.createGain(); sfxBus.gain.value = 0.65; sfxBus.connect(master);
		musBus = AC.createGain(); musBus.gain.value = 0.5; musBus.connect(master);
		/* everything melodic goes through a dark low-pass, like an old tape */
		var lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2100; lp.Q.value = 0.6;
		musIn = AC.createGain(); musIn.gain.value = 1; musIn.connect(lp); lp.connect(musBus);
		NB = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
		var d = NB.getChannelData(0);
		for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
		/* slow tape wobble shared by every note */
		LFO = AC.createGain(); LFO.gain.value = 7;
		var o = AC.createOscillator(); o.frequency.value = 0.45; o.connect(LFO); o.start();
	}
	if (AC.state === "suspended") AC.resume();
}
function mtof(n){ return 440 * Math.pow(2, (n - 69) / 12); }
function now(){ return AC ? AC.currentTime : 0; }
function tone(type, f0, f1, dur, vol, when, dest){
	if (!AC) return;
	var t = when || AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
	o.type = type;
	o.frequency.setValueAtTime(f0, t);
	if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
	g.gain.setValueAtTime(vol, t);
	g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
	o.connect(g); g.connect(dest || sfxBus);
	o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, vol, freq, when, dest, kind, q){
	if (!AC) return;
	var t = when || AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
	s.buffer = NB;
	f.type = kind || "lowpass";
	f.frequency.setValueAtTime(freq, t);
	if (q) f.Q.value = q;
	if (!kind) f.frequency.exponentialRampToValueAtTime(80, t + dur);
	g.gain.setValueAtTime(vol, t);
	g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
	s.connect(f); f.connect(g); g.connect(dest || sfxBus);
	s.start(t, Math.random() * Math.max(0, 1.9 - dur)); s.stop(t + dur + 0.03);
}
function arp(notes, gap, type, dur, vol){
	if (!AC) return;
	var t = AC.currentTime;
	notes.forEach(function(n, i){ tone(type || "square", mtof(n), 0, dur || 0.09, vol || 0.1, t + i * gap); });
}
/* electric piano: a tiny FM pair, soft attack, bell that fades into a round tone */
function ep(n, t, dur, vel, dest, bright){
	var f = mtof(n), car = AC.createOscillator(), mod = AC.createOscillator(), mg = AC.createGain(), g = AC.createGain();
	car.type = "sine"; mod.type = "sine";
	car.frequency.value = f; mod.frequency.value = f;
	car.detune.value = rnd(-6, 6);
	LFO.connect(car.detune);
	mg.gain.setValueAtTime(f * (bright || 1.4) * vel, t);
	mg.gain.exponentialRampToValueAtTime(f * 0.05 + 0.01, t + 0.7);
	mod.connect(mg); mg.connect(car.frequency);
	g.gain.setValueAtTime(0.0001, t);
	g.gain.linearRampToValueAtTime(0.085 * vel, t + 0.012);
	g.gain.setTargetAtTime(0.0001, t + dur, 0.12);
	car.connect(g); g.connect(dest || musIn);
	mod.start(t); car.start(t); mod.stop(t + dur + 0.8); car.stop(t + dur + 0.8);
}
var lastSfx = {};
function once(k, gap){ var t = now(); if (lastSfx[k] && t - lastSfx[k] < gap) return false; lastSfx[k] = t; return true; }
var SFX = {
	blip: function(){ tone("square", 660, 0, 0.05, 0.07); },
	move: function(){ tone("triangle", 520, 0, 0.04, 0.08); },
	select: function(){ arp([72, 79], 0.06, "square", 0.07, 0.08); },
	back: function(){ arp([67, 60], 0.06, "square", 0.07, 0.07); },
	type: function(){ tone("square", rnd(900, 1300), 0, 0.02, 0.03); },
	key: function(){ noise(0.025, 0.12, 4000, 0, 0, "bandpass", 1.5); tone("square", rnd(1500, 1800), 0, 0.012, 0.02); },
	err: function(){ tone("sawtooth", 140, 110, 0.12, 0.12); },
	shoot: function(){ if (once("shoot", 0.05)) tone("square", 1400, 500, 0.05, 0.03); },
	hit: function(){ if (once("hit", 0.04)) tone("square", 420, 180, 0.05, 0.06); },
	boom: function(){ noise(0.32, 0.4, 2600); tone("triangle", 170, 40, 0.26, 0.28); },
	bigboom: function(){ noise(1.1, 0.7, 4200); tone("sawtooth", 95, 22, 0.9, 0.26); },
	power: function(){ arp([72, 76, 79, 84, 88], 0.055, "square", 0.08, 0.09); },
	coin: function(){ arp([83, 88], 0.07, "square", 0.08, 0.07); },
	hurt: function(){ tone("sawtooth", 320, 55, 0.45, 0.22); noise(0.35, 0.32, 1600); },
	jump: function(){ tone("square", 300, 700, 0.12, 0.06); },
	land: function(){ noise(0.06, 0.12, 600); },
	bounce: function(p){ tone("triangle", p || 440, 0, 0.07, 0.14); },
	clink: function(){ tone("square", 1900, 1700, 0.05, 0.05); tone("triangle", 2600, 0, 0.12, 0.05); },
	eat: function(p){ tone("square", mtof(p || 72), mtof((p || 72) + 12), 0.08, 0.08); },
	level: function(){ arp([64, 68, 71, 76, 80, 83], 0.07, "square", 0.12, 0.08); },
	unlock: function(){
		arp([64, 66, 68, 71, 73, 76, 78, 80, 83, 88], 0.055, "square", 0.12, 0.08);
		var t = now() + 0.62;
		if (AC) [64, 68, 71, 75, 78].forEach(function(n, i){ ep(n, t + i * 0.025, 1.6, 0.9, sfxBus, 2); });
	},
	alarm: function(){ if (!AC) return; for (var i = 0; i < 6; i++) tone("square", i % 2 ? 660 : 880, 0, 0.16, 0.07, AC.currentTime + i * 0.2); },
	charge: function(){ tone("sawtooth", 90, 900, 1.0, 0.09); },
	laser: function(){ noise(0.8, 0.28, 1400); tone("sawtooth", 82, 70, 0.8, 0.18); },
	eshot: function(){ if (once("eshot", 0.05)) tone("triangle", 560, 260, 0.07, 0.045); },
	dive: function(){ tone("square", 900, 200, 0.25, 0.045); },
	over: function(){ if (!AC) return; var t = AC.currentTime + 0.45;
		[71, 67, 64, 59, 55].forEach(function(n, i){ ep(n, t + i * 0.22, 0.4, 0.9, sfxBus, 1.2); }); }
};

/* ================= music: lo-fi jazz loop, scheduled ahead on the audio clock ================= */
/* 8 bars in E: Emaj9 · D#m7 · G#m9 · C#9sus4 · F#m11 · B13 · Emaj7#11 · D#7#9 (borrowed and altered chords, no stock loop) */
var PROG = [
	{ b: 40, n: [56, 59, 63, 66] },
	{ b: 39, n: [54, 58, 61, 66] },
	{ b: 44, n: [54, 58, 59, 63] },
	{ b: 37, n: [54, 59, 61, 63] },
	{ b: 42, n: [52, 57, 59, 64] },
	{ b: 35, n: [51, 56, 57, 61] },
	{ b: 40, n: [56, 58, 63, 66] },
	{ b: 39, n: [55, 61, 66, 67] }
];
var COMP = [ [[0, 7], [7, 3], [10, 6]], [[0, 9], [11, 5]], [[2, 5], [7, 9]], [[0, 3], [3, 4], [10, 6]], [[0, 14]], [[0, 2], [6, 4], [12, 4]] ];
var PENTA = [64, 66, 68, 71, 73, 76, 78, 80, 83];
var BPM = 78, step = 0, nextT = 0, musTimer = 0, hiss = null, phrase = [];
function s16(){ return 60 / BPM / 4; }
function playStep(s, t){
	var bar = (s >> 4) % 8, i = s & 15, ch = PROG[bar], nx = PROG[(bar + 1) % 8], q = s16();
	if (i % 2) t += q * 0.3;                                   /* swing */
	t += rnd(-0.006, 0.006);                                   /* human */

	if (i === 0){
		ch.comp = pick(COMP);
		/* a short melodic answer now and then */
		phrase = [];
		if (bar % 2 === 1 && Math.random() < 0.55){
			var k = irnd(2, 5), at = irnd(2, 6), p = irnd(2, 6);
			for (var j = 0; j < k && at < 16; j++){ phrase.push([at, PENTA[p]]); at += pick([1, 2, 2, 3, 4]); p = clamp(p + pick([-2, -1, -1, 1, 1, 2]), 0, PENTA.length - 1); }
		}
	}
	/* keys (sometimes the next chord is pushed an eighth early, like a real player would) */
	function chord(c, len){
		var vel = rnd(0.55, 0.9);
		c.n.forEach(function(n, k){ ep(n, t + k * rnd(0.008, 0.02), q * len * 0.95, vel * (k === c.n.length - 1 ? 1 : 0.8)); });
	}
	(ch.comp || COMP[0]).forEach(function(c){ if (c[0] === i && !(i === 0 && ch.pushed)) chord(ch, c[1]); });
	if (i === 0) ch.pushed = false;
	if (i === 14 && Math.random() < 0.22){ nx.pushed = true; chord(nx, 4); }
	phrase.forEach(function(ph){ if (ph[0] === i) ep(ph[1], t, q * 2.2, rnd(0.45, 0.65), musIn, 2.2); });

	/* upright-ish bass */
	var bn = -1, bd = 0;
	if (i === 0){ bn = ch.b; bd = 6; }
	else if (i === 7 && Math.random() < 0.6){ bn = ch.b + pick([7, 12, 10]); bd = 3; }
	else if (i === 10){ bn = ch.b + pick([7, 0, 12]); bd = 3; }
	else if (i === 14 && Math.random() < 0.7){ bn = nx.b + pick([-1, 1, 2]); bd = 2; }
	if (bn > 0){
		var bt = AC.createOscillator(), bg = AC.createGain();
		bt.type = "triangle"; bt.frequency.value = mtof(bn); LFO.connect(bt.detune);
		bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(0.34, t + 0.02); bg.gain.setTargetAtTime(0.0001, t + q * bd * 0.9, 0.06);
		bt.connect(bg); bg.connect(musIn); bt.start(t); bt.stop(t + q * bd + 0.5);
	}

	/* boom bap */
	if (i === 0 || i === 10 || (i === 7 && Math.random() < 0.35)) tone("sine", 115, 42, 0.32, 0.62, t, musBus);
	if (i === 4 || i === 12){ noise(0.2, 0.22, 1800, t + 0.018, musBus, "bandpass", 0.9); tone("triangle", 200, 150, 0.08, 0.1, t + 0.018, musBus); }
	if (i % 2 === 0 || Math.random() < 0.22) noise(0.03, (i % 4 === 2 ? 0.07 : 0.045) * rnd(0.6, 1.1), 7500, t, musBus, "highpass");
	if (i === 14 && Math.random() < 0.3) noise(0.18, 0.04, 6000, t, musBus, "highpass");

	/* vinyl crackle */
	if (Math.random() < 0.35) noise(0.004, rnd(0.02, 0.09), 2500, t + rnd(0, q), musBus, "highpass");
}
function musicTick(){
	if (!AC) return;
	if (nextT < AC.currentTime) nextT = AC.currentTime + 0.05;
	while (nextT < AC.currentTime + 0.2){ playStep(step, nextT); nextT += s16(); step = (step + 1) % 128; }
}
function startMusic(){
	if (!AC || musTimer) return;
	nextT = AC.currentTime + 0.08;
	musTimer = setInterval(musicTick, 30);
	if (!hiss){
		hiss = AC.createBufferSource(); hiss.buffer = NB; hiss.loop = true;
		var f = AC.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 3200; f.Q.value = 0.4;
		var g = AC.createGain(); g.gain.value = 0.012;
		hiss.connect(f); f.connect(g); g.connect(musBus); hiss.start();
	}
}
function stopMusic(){
	clearInterval(musTimer); musTimer = 0;
	if (hiss){ try { hiss.stop(); } catch (e){} hiss = null; }
}
function toggleMute(){
	muted = !muted;
	save("ayka-game-mute", muted ? "1" : "0");
	if (master) master.gain.setTargetAtTime(muted ? 0 : 0.6, AC.currentTime, 0.02);
}

/* ================= layout ================= */
/* world units: one character width (cw) on both axes. A text row is RH units tall. */
var COLS = 56, DPR, W, H, fs, cw, chh, RH, FH, ox, oy, scanPat, vign;
function layout(g){
	g = g || MENU;
	COLS = g.cols;
	DPR = Math.min(devicePixelRatio || 1, 2);
	W = innerWidth; H = innerHeight;
	cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
	var maxFs = g.rows ? Math.floor((H - 16) / (g.rows * 1.2)) : Math.floor(H / 34);
	fs = Math.floor(Math.min(W - 16, 1100) / COLS / 0.6);
	fs = Math.max(7, Math.min(20, fs, maxFs));
	ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
	ctx.font = fs + "px " + FONT;
	cw = ctx.measureText("M").width;
	chh = Math.round(fs * 1.2);
	RH = chh / cw;
	var fw = COLS * cw, fh = g.rows ? g.rows * chh : Math.min(H - 16, fw * (g.aspect || 1.45));
	FH = fh / cw;
	ox = Math.round((W - fw) / 2);
	oy = Math.round((H - fh) * (H - fh > 160 ? 0.3 : 0.5));
	var p = document.createElement("canvas"); p.width = 1; p.height = 3;
	var pc = p.getContext("2d"); pc.fillStyle = "rgba(0,0,0,.28)"; pc.fillRect(0, 2, 1, 1);
	scanPat = ctx.createPattern(p, "repeat");
	vign = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
	vign.addColorStop(0, "rgba(0,0,0,0)"); vign.addColorStop(1, "rgba(0,0,0,.6)");
	if (g.resize) g.resize();
}

/* ================= drawing helpers ================= */
function setFont(size, bold){ ctx.font = (bold ? "700 " : "") + Math.round(fs * (size || 1)) + "px " + FONT; }
function txt(s, x, y, col, a){
	ctx.globalAlpha = a == null ? 1 : a;
	ctx.fillStyle = col;
	ctx.fillText(s, ox + x * cw, oy + y * cw);
}
function spr(rows, x, y, col){
	ctx.fillStyle = col;
	for (var i = 0; i < rows.length; i++) ctx.fillText(rows[i], ox + x * cw, oy + (y + i * RH) * cw);
}
function rectU(x, y, w, h, col, a){ ctx.globalAlpha = a == null ? 1 : a; ctx.fillStyle = col; ctx.fillRect(ox + x * cw, oy + y * cw, w * cw, h * cw); ctx.globalAlpha = 1; }
function glow(col, n){ if (GLOW){ ctx.shadowColor = col; ctx.shadowBlur = n || 8; } }
function noGlow(){ ctx.shadowBlur = 0; }
function center(s, y, col, size, bold, a){
	setFont(size, bold);
	ctx.textAlign = "center";
	ctx.globalAlpha = a == null ? 1 : a;
	ctx.fillStyle = col;
	ctx.fillText(s, ox + COLS * cw / 2, oy + y * cw);
	ctx.textAlign = "left";
	setFont(1);
	ctx.globalAlpha = 1;
}
function gradient(){
	var g = ctx.createLinearGradient(ox + COLS * cw * 0.15, 0, ox + COLS * cw * 0.85, 0);
	g.addColorStop(0, C.green); g.addColorStop(0.35, C.blue); g.addColorStop(0.7, C.purple); g.addColorStop(1, C.red);
	return g;
}
function glitchTitle(s, y, size, col, a){
	var jit = Math.random() < 0.08 && !REDUCE ? rnd(-3, 3) : 0;
	ctx.save();
	if (jit){
		ctx.globalCompositeOperation = "lighter";
		ctx.translate(jit, 0); center(s, y, "rgba(255,123,114,.55)", size, true, a);
		ctx.translate(-2 * jit, 0); center(s, y, "rgba(121,192,255,.55)", size, true, a);
		ctx.translate(jit, 0);
		ctx.globalCompositeOperation = "source-over";
	}
	glow(C.purple, 18);
	center(s, y, col, size, true, a);
	noGlow();
	ctx.restore();
}
function box(x, y, w, h, col){
	var top = "+" + rep("-", w - 2) + "+";
	txt(top, x, y, col);
	for (var i = 1; i < h - 1; i++){ txt("|", x, y + i * RH, col); txt("|", x + w - 1, y + i * RH, col); }
	txt(top, x, y + (h - 1) * RH, col);
}
var EYE = ["  .-'''''-.  ", " /  .---.  \\ ", "|  (     )  |", " \\  '---'  / ", "  '-.....-'  "];
var EYE_SHUT = ["  .-'''''-.  ", " /         \\ ", "|  -------  |", " \\         / ", "  '-.....-'  "];
function drawEye(x, y, col, look, shut, pupilCol){
	spr(shut ? EYE_SHUT : EYE, x, y, col);
	if (!shut){ ctx.fillStyle = pupilCol || C.red; ctx.fillText("@", ox + (x + 6 + Math.round(look * 2)) * cw, oy + (y + 2 * RH) * cw); }
}

/* ================= shared fx ================= */
var FX = { parts: [], pops: [], shake: 0, flash: 0, warp: 0, stars: [] };
var PCH = [".", "*", "+", "x", "#", "%", "'", "`", "@"];
function burst(x, y, col, n, spd, chars){
	for (var i = 0; i < n; i++){
		var a = Math.random() * 6.283, v = rnd(0.2, 1) * spd, l = rnd(0.3, 0.9);
		FX.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, ch: pick(chars || PCH), col: Math.random() < 0.3 ? C.hi : col });
	}
}
function pop(x, y, text, col){ FX.pops.push({ x: x - text.length / 2, y: y, text: text, col: col || C.fg, life: 0.9 }); }
function shake(n){ if (!REDUCE) FX.shake = Math.max(FX.shake, n); }
function flash(n){ FX.flash = Math.max(FX.flash, n); }
function clearFx(){ FX.parts = []; FX.pops = []; FX.shake = 0; }
function updateFx(dt){
	FX.parts = FX.parts.filter(function(p){
		p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 2 * dt; p.vy *= 1 - 2 * dt;
		return (p.life -= dt) > 0;
	});
	FX.pops = FX.pops.filter(function(p){ p.y -= 5 * dt; return (p.life -= dt) > 0; });
	FX.shake = Math.max(0, FX.shake - dt * 30);
	FX.flash = Math.max(0, FX.flash - dt * 2.2);
}
function drawFx(){
	FX.parts.forEach(function(q){ txt(q.ch, q.x, q.y, q.col, q.life / q.max); });
	FX.pops.forEach(function(q){ txt(q.text, q.x, q.y, q.col, Math.min(1, q.life * 2)); });
	ctx.globalAlpha = 1;
}
function newStar(y){
	var l = Math.random(), layer = l < 0.6 ? 0 : l < 0.9 ? 1 : 2;
	return { x: Math.random() * COLS, y: y, l: layer,
		ch: layer === 0 ? (Math.random() < 0.25 ? pick(["0", "1"]) : ".") : layer === 1 ? pick([".", "·"]) : pick(["+", "*", "·"]) };
}
function updateStars(dt, speed){
	if (FX.stars.length < 80) for (var i = FX.stars.length; i < 80; i++) FX.stars.push(newStar(Math.random() * 140));
	var sp = [5, 11, 22], boost = (speed || 1) * (1 + FX.warp * 8);
	FX.stars.forEach(function(s){
		s.y += sp[s.l] * boost * dt;
		if (s.y > FH + 1 || s.x > COLS){ var n = newStar(-1); s.x = n.x; s.y = n.y; s.ch = n.ch; }
	});
	FX.warp = Math.max(0, FX.warp - dt * 0.7);
}
function drawStars(){
	var SC = [C.faint, C.mid, C.dim];
	FX.stars.forEach(function(s){ if (s.y < FH) txt(s.ch, s.x, s.y, SC[s.l]); });
	ctx.globalAlpha = 1;
}

/* ================= BUGHUNT: vertical shooter ================= */
var BUGHUNT = (function(){
	var G = {};
	var TYPES = {
		mite:   { spr: ["{*}"], col: C.green, hp: 1, pts: 100, speed: 9 },
		crawl:  { spr: ["/^^\\", "\\vv/"], col: C.blue, hp: 2, pts: 200, speed: 6, shoot: 2.6 },
		dart:   { spr: ["\\!/", " V "], col: C.red, hp: 1, pts: 150, speed: 9 },
		glitch: { spr: ["#%#", "%@%"], col: C.purple, hp: 3, pts: 300, speed: 5, shoot: 1.9 }
	};
	var PLAYER = ["  ^  ", " /o\\ ", "<_#_>"];
	var PUPS = { S: { col: C.blue, name: "spread shot" }, R: { col: C.green, name: "rapid fire" },
		"+": { col: C.red, name: "+1 life" }, B: { col: C.yellow, name: "bomb!" } };

	function start(){
		G.score = 0; G.wave = 0; G.lives = 3; G.combo = 0; G.comboT = 0;
		G.player = { x: COLS / 2 - 2.5, y: FH - 3 * RH - 4, w: 5, h: 3 * RH, inv: 1.5, dead: false };
		G.bullets = []; G.eb = []; G.enemies = []; G.pups = [];
		G.boss = null; G.queue = []; G.spawnT = 0; G.clearT = 0;
		G.spread = 0; G.rapid = 0; G.fireT = 0;
		FX.warp = 1;
		nextWave();
	}
	function nextWave(){
		G.wave++;
		G.clearT = 0;
		if (G.wave % 5 === 0){ spawnBoss(); return; }
		var n = Math.min(44, 6 + G.wave * 3), pool = ["mite", "mite", "mite"];
		if (G.wave >= 2) pool.push("crawl", "crawl");
		if (G.wave >= 3) pool.push("dart", "dart");
		if (G.wave >= 4) pool.push("glitch");
		if (G.wave >= 7) pool.push("glitch", "dart");
		G.queue = [];
		while (G.queue.length < n) G.queue.push(pick(pool));
		G.spawnT = 1.2;
		banner("WAVE " + pad(G.wave, 2), C.hi, 1.6);
		SFX.level();
	}
	function spawnEnemy(type, x){
		var T = TYPES[type], w = T.spr[0].length;
		var e = { type: type, T: T, w: w, h: T.spr.length * RH, hp: T.hp + Math.floor(G.wave / 6), t: 0,
			ph: Math.random() * 6.28, vx: (Math.random() < 0.5 ? -1 : 1) * rnd(4, 9), hitT: 0, jT: 0.8,
			sT: T.shoot ? T.shoot * rnd(0.4, 1.2) : 0, sp: T.speed * (1 + G.wave * 0.05) };
		e.x = x == null ? rnd(2, COLS - 2 - w) : x;
		e.x0 = e.x;
		e.y = -e.h - rnd(0, 2);
		e.ty = rnd(5, FH * 0.35);
		G.enemies.push(e);
		return e;
	}
	function spawnNext(){
		var type = G.queue.shift();
		if (type === "mite"){
			var x = rnd(7, COLS - 10);
			spawnEnemy("mite", x);
			for (var i = 1; i < 3 && G.queue[0] === "mite"; i++){ G.queue.shift(); spawnEnemy("mite", x).y -= i * RH * 1.6; }
		}
		else spawnEnemy(type);
	}
	function spawnBoss(){
		var n = G.wave / 5;
		G.boss = { x: COLS / 2 - 6.5, y: -5 * RH - 2, w: 13, h: 5 * RH, hp: 70 + 45 * (n - 1), t: 0, atkT: 2.4, atk: 0,
			hitT: 0, n: n, burst: 0, burstT: 0, laser: null, dying: 0, blinkT: 3 };
		G.boss.max = G.boss.hp;
		banner("!! ROOT BUG DETECTED !!", C.red, 2.6);
		SFX.alarm();
	}
	function eshot(x, y, vx, vy, ch, col){ G.eb.push({ x: x, y: y, vx: vx, vy: vy, ch: ch || "*", col: col || C.red }); }
	function aim(x, y, spd, da){
		var p = G.player, dx = p.x + p.w / 2 - x, dy = p.y + p.h / 2 - y, a = Math.atan2(dy, dx) + (da || 0);
		return [Math.cos(a) * spd, Math.sin(a) * spd];
	}
	function eSpeed(){ return 19 + G.wave * 0.6; }
	function playerFire(){
		var p = G.player, cx = p.x + 2, y = p.y - RH * 0.6;
		G.bullets.push({ x: cx, y: y, vx: 0, vy: -78, ch: "|" });
		if (G.spread > 0){
			G.bullets.push({ x: cx - 1, y: y + 0.5, vx: -16, vy: -74, ch: "\\" });
			G.bullets.push({ x: cx + 1, y: y + 0.5, vx: 16, vy: -74, ch: "/" });
		}
		G.fireT = G.rapid > 0 ? 0.085 : 0.16;
		SFX.shoot();
	}
	function kill(e, noDrop){
		if (e.dead) return;
		e.dead = true;
		G.combo = G.comboT > 0 ? Math.min(8, G.combo + 1) : 1;
		G.comboT = 1.4;
		var pts = e.T.pts * G.combo, cx = e.x + e.w / 2, cy = e.y + e.h / 2;
		G.score += pts;
		pop(cx, e.y, "+" + pts, G.combo > 1 ? C.yellow : C.fg);
		burst(cx, cy, e.T.col, 18, 24);
		shake(2.5);
		SFX.boom();
		if (!noDrop && Math.random() < 0.075) drop(cx, cy);
	}
	function drop(x, y, k){ G.pups.push({ k: k || pick(["S", "R", "S", "R", "+", "B"]), x: x - 1.5, y: y, w: 3, h: RH, t: 0 }); }
	function hurt(){
		var p = G.player;
		if (p.inv > 0 || mode !== "play") return;
		G.lives--;
		p.inv = 2.2;
		G.spread = G.rapid = 0;
		shake(10); flash(0.45);
		burst(p.x + 2.5, p.y + p.h / 2, C.red, 30, 30);
		SFX.hurt();
		if (G.lives <= 0){
			p.dead = true;
			burst(p.x + 2.5, p.y + p.h / 2, C.orange, 60, 40);
			burst(p.x + 2.5, p.y + p.h / 2, C.hi, 30, 20);
			SFX.bigboom();
			gameOver(G.score);
		}
	}
	function bomb(){
		G.enemies.forEach(function(e){ kill(e, true); });
		G.eb = [];
		if (G.boss && !G.boss.dying){ G.boss.hp -= 18; G.boss.hitT = 0.2; if (G.boss.hp <= 0) bossDie(); }
		flash(1); shake(14);
		SFX.bigboom();
	}
	function collect(u){
		var P = PUPS[u.k];
		if (u.k === "S") G.spread = 12;
		else if (u.k === "R") G.rapid = 12;
		else if (u.k === "+") G.lives = Math.min(5, G.lives + 1);
		else bomb();
		G.score += 50;
		pop(u.x + 1.5, u.y - 1, P.name, P.col);
		SFX.power();
	}
	function bossDie(){
		var b = G.boss;
		b.dying = 1.8; b.laser = null;
		G.eb = [];
		G.score += 5000 * b.n;
		pop(b.x + 6, b.y, "+" + 5000 * b.n, C.yellow);
		SFX.bigboom();
	}
	function hitRect(px, py, e, m){ m = m || 0; return px > e.x - m && px < e.x + e.w + m && py > e.y - m && py < e.y + e.h + m; }
	function overlap(a, b){ return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

	function update(dt){
		var p = G.player;
		updateStars(dt);
		var dx = (K.r ? 1 : 0) - (K.l ? 1 : 0), dy = (K.d ? 1 : 0) - (K.u ? 1 : 0);
		if (dx && dy){ dx *= 0.72; dy *= 0.72; }
		p.x = clamp(p.x + dx * 36 * dt, 0, COLS - p.w);
		p.y = clamp(p.y + dy * 32 * dt, FH * 0.3, FH - p.h - 0.5);
		p.inv = Math.max(0, p.inv - dt);
		G.spread = Math.max(0, G.spread - dt);
		G.rapid = Math.max(0, G.rapid - dt);
		G.comboT = Math.max(0, G.comboT - dt);
		if (!G.comboT) G.combo = 0;
		if ((G.fireT -= dt) <= 0) playerFire();

		if (G.queue.length && (G.spawnT -= dt) <= 0){
			spawnNext();
			G.spawnT = Math.max(0.28, 1.05 - G.wave * 0.06) * rnd(0.7, 1.3);
		}

		G.enemies.forEach(function(e){
			e.t += dt; e.hitT -= dt;
			if (e.type === "mite"){ e.y += e.sp * dt; e.x = clamp(e.x0 + Math.sin(e.t * 2.2 + e.ph) * 5, 0, COLS - e.w); }
			else if (e.type === "crawl"){
				e.y += e.sp * dt; e.x += e.vx * dt;
				if (e.x < 0 || e.x > COLS - e.w){ e.vx *= -1; e.x = clamp(e.x, 0, COLS - e.w); }
			}
			else if (e.type === "glitch"){
				e.y += (e.y < e.ty ? e.sp * 2.4 : e.sp * 0.22) * dt;
				if ((e.jT -= dt) <= 0){
					e.jT = rnd(0.5, 1.1);
					burst(e.x + 1.5, e.y + e.h / 2, C.purple, 6, 10);
					e.x = clamp(e.x + rnd(-8, 8), 0, COLS - e.w);
				}
			}
			else if (e.type === "dart"){
				if (!e.dive){
					if (e.y < e.ty) e.y += e.sp * 2 * dt;
					else if ((e.wait = (e.wait || 0) + dt) > 0.55){
						e.dive = true;
						var v = aim(e.x + 1.5, e.y + e.h / 2, 40);
						e.dvx = v[0]; e.dvy = v[1];
						SFX.dive();
					}
				}
				else { e.x += e.dvx * dt; e.y += e.dvy * dt; }
			}
			if (e.T.shoot && e.y > 0 && e.y < FH * 0.65 && (e.sT -= dt) <= 0){
				e.sT = e.T.shoot * rnd(0.7, 1.3) / (1 + G.wave * 0.04);
				var cx = e.x + e.w / 2 - 0.5, cy = e.y + e.h;
				if (e.type === "crawl"){ var a = aim(cx, cy, eSpeed()); eshot(cx, cy, a[0], a[1], "*", C.blue); }
				else [-0.35, 0, 0.35].forEach(function(da){ eshot(cx, cy, Math.sin(da) * eSpeed(), Math.cos(da) * eSpeed(), "o", C.purple); });
				SFX.eshot();
			}
			if (e.y > FH + 3 || e.x < -8 || e.x > COLS + 8 || e.y < -40) e.dead = true;
		});

		var b = G.boss;
		if (b){
			b.t += dt; b.hitT -= dt;
			if (b.dying){
				if (Math.random() < dt * 14){ burst(b.x + rnd(0, b.w), b.y + rnd(0, b.h), pick([C.purple, C.red, C.orange, C.hi]), 14, 22); shake(4); SFX.boom(); }
				if ((b.dying -= dt) <= 0){
					burst(b.x + b.w / 2, b.y + b.h / 2, C.purple, 80, 45);
					burst(b.x + b.w / 2, b.y + b.h / 2, C.hi, 40, 25);
					drop(b.x + b.w / 2, b.y + b.h / 2, "+"); drop(b.x + b.w / 2 + 4, b.y + b.h / 2, pick(["S", "R"]));
					G.boss = null; flash(0.8); shake(16);
					SFX.bigboom();
					banner("ROOT BUG PURGED", C.green, 2);
				}
			}
			else {
				var ty = 3 + RH * 1.6;
				if (b.y < ty) b.y = Math.min(ty, b.y + 9 * dt);
				else {
					if (!b.laser) b.x = COLS / 2 - 6.5 + Math.sin(b.t * (0.55 + b.n * 0.08)) * (COLS / 2 - 9);
					if (b.burst > 0 && (b.burstT -= dt) <= 0){
						b.burst--; b.burstT = 0.13;
						[-0.18, 0, 0.18].forEach(function(da){ var a = aim(b.x + 6, b.y + b.h, eSpeed() + 4, da); eshot(b.x + 6, b.y + b.h, a[0], a[1], "*", C.red); });
						SFX.eshot();
					}
					if (b.laser){
						var L = b.laser;
						L.t += dt;
						if (!L.fired && L.t > 1){ L.fired = true; SFX.laser(); shake(6); }
						if (L.t > 1 && L.t < 1.8 && Math.abs(G.player.x + G.player.w / 2 - (L.x + 0.5)) < 2) hurt();
						if (L.t > 1.85) b.laser = null;
					}
					else if ((b.atkT -= dt) <= 0){
						var kind = b.atk++ % 3, cx = b.x + 6, cy = b.y + b.h * 0.55;
						if (kind === 0){
							var k = 14 + b.n * 3;
							for (var i = 0; i < k; i++){ var an = i / k * 6.283 + b.t; eshot(cx, cy, Math.cos(an) * 15, Math.sin(an) * 12 + 4, "o", C.purple); }
							SFX.eshot();
						}
						else if (kind === 1){ b.burst = 4 + b.n; b.burstT = 0; }
						else { b.laser = { t: 0, x: cx }; SFX.charge(); }
						b.atkT = Math.max(1.1, 2.3 - b.n * 0.25);
					}
				}
				if ((b.blinkT -= dt) < -0.14) b.blinkT = rnd(2, 4.5);
			}
		}

		G.bullets = G.bullets.filter(function(u){
			u.x += u.vx * dt; u.y += u.vy * dt;
			if (u.y < -2 || u.x < -2 || u.x > COLS + 2) return false;
			var px = u.x + 0.5, py = u.y + RH / 2;
			for (var i = 0; i < G.enemies.length; i++){
				var e = G.enemies[i];
				if (!e.dead && hitRect(px, py, e, 0.3)){
					e.hp--; e.hitT = 0.08;
					if (e.hp <= 0) kill(e); else SFX.hit();
					burst(px, py, C.hi, 3, 8);
					return false;
				}
			}
			if (G.boss && !G.boss.dying && G.boss.y > -2 && hitRect(px, py, { x: G.boss.x + 1, y: G.boss.y, w: 11, h: G.boss.h })){
				G.boss.hp--; G.boss.hitT = 0.06; G.score += 10;
				burst(px, py, C.purple, 3, 10);
				SFX.hit();
				if (G.boss.hp <= 0) bossDie();
				return false;
			}
			return true;
		});
		var hb = { x: p.x + 1.2, y: p.y + RH * 0.4, w: p.w - 2.4, h: p.h - RH * 0.8 };
		G.eb = G.eb.filter(function(u){
			u.x += u.vx * dt; u.y += u.vy * dt;
			if (u.y > FH + 2 || u.y < -6 || u.x < -2 || u.x > COLS + 2) return false;
			if (hitRect(u.x + 0.5, u.y + RH / 2, hb)){ hurt(); return false; }
			return true;
		});
		G.enemies.forEach(function(e){ if (!e.dead && overlap(e, hb)){ kill(e, true); hurt(); } });
		if (G.boss && !G.boss.dying && overlap({ x: G.boss.x + 2, y: G.boss.y, w: 9, h: G.boss.h }, hb)) hurt();
		G.enemies = G.enemies.filter(function(e){ return !e.dead; });

		G.pups = G.pups.filter(function(u){
			u.t += dt; u.y += 7 * dt;
			if (overlap(u, p)){ collect(u); return false; }
			return u.y < FH + 2;
		});

		if (mode === "play" && !G.queue.length && !G.enemies.length && !G.boss){
			if (!G.clearT) G.clearT = 1.3;
			else if ((G.clearT -= dt) <= 0) nextWave();
		}
	}

	function draw(){
		var p = G.player;
		drawStars();
		G.pups.forEach(function(u){
			if (u.t > 8 && Math.floor(T * 8) % 2) return;
			glow(PUPS[u.k].col, 10);
			txt("[" + u.k + "]", u.x, u.y, PUPS[u.k].col);
		});
		G.enemies.forEach(function(e){
			glow(e.T.col, 8);
			var rows = e.T.spr;
			if (e.type === "glitch" && Math.random() < 0.15) rows = [pick(["#%#", "%#%", "@#%"]), pick(["%@%", "#@#", "%%@"])];
			if (e.type === "dart" && e.dive) rows = [" | ", "\\V/"];
			spr(rows, e.x, e.y, e.hitT > 0 ? C.hi : e.T.col);
		});
		var b = G.boss;
		if (b){
			if (b.laser){
				var L = b.laser, lx = ox + L.x * cw, top = oy + (b.y + b.h) * cw;
				if (L.t < 1){
					if (Math.floor(T * 16) % 2){ ctx.globalAlpha = 0.5; ctx.fillStyle = C.red; for (var yy = b.y + b.h; yy < FH; yy += RH) ctx.fillText("¦", lx, oy + yy * cw); }
				}
				else if (L.t < 1.8){
					var wpx = cw * (3 + Math.sin(T * 60) * 0.6);
					glow(C.red, 24);
					ctx.globalAlpha = 0.85; ctx.fillStyle = C.red; ctx.fillRect(lx + cw / 2 - wpx / 2, top, wpx, FH * cw);
					ctx.globalAlpha = 1; ctx.fillStyle = C.hi; ctx.fillRect(lx + cw / 2 - wpx / 6, top, wpx / 3, FH * cw);
					noGlow();
				}
				ctx.globalAlpha = 1;
			}
			var look = clamp((p.x + 2.5 - (b.x + 6.5)) / 14, -1, 1), charging = b.laser && b.laser.t < 1.8;
			if (!(b.dying && Math.floor(T * 20) % 2)){
				glow(C.purple, 14);
				drawEye(b.x, b.y, b.hitT > 0 ? C.hi : C.purple, b.laser ? 0 : look, b.blinkT < 0 && !charging,
					charging ? (Math.floor(T * 14) % 2 ? C.hi : C.red) : C.red);
				noGlow();
			}
		}
		glow(C.green, 6);
		ctx.fillStyle = C.green;
		G.bullets.forEach(function(u){ ctx.fillText(u.ch, ox + u.x * cw, oy + u.y * cw); });
		G.eb.forEach(function(u){ glow(u.col, 6); ctx.fillStyle = u.col; ctx.fillText(u.ch, ox + u.x * cw, oy + u.y * cw); });
		noGlow();
		if (!p.dead && !(p.inv > 0 && Math.floor(T * 14) % 2)){
			glow(C.green, 10);
			spr(PLAYER, p.x, p.y, C.hi);
			ctx.fillStyle = G.spread > 0 ? C.blue : G.rapid > 0 ? C.green : C.purple;
			ctx.fillText("#", ox + (p.x + 2) * cw, oy + (p.y + 2 * RH) * cw);
			noGlow();
			txt(Math.floor(T * 20) % 2 ? " ' ' " : " \" \" ", p.x, p.y + 3 * RH - 0.4, Math.floor(T * 10) % 2 ? C.orange : C.red);
		}
		drawFx();

		txt("SCORE " + pad(G.score, 7), 1, 0.8, C.fg);
		txt("HI    " + pad(Math.max(hiOf(BUGHUNT), G.score), 7), 1, 0.8 + RH, C.dim);
		var hearts = "";
		for (var i = 0; i < 5; i++) hearts += i < G.lives ? "♥" : " ";
		txt(hearts, COLS - 6, 0.8, C.red);
		txt("WAVE " + pad(G.wave, 2), COLS - 8, 0.8 + RH, C.dim);
		if (G.combo > 1) center("x" + G.combo + " combo", 0.8, C.yellow, 1, true, Math.min(1, G.comboT * 2));
		var pw = [];
		if (G.spread > 0) pw.push(["[S] " + Math.ceil(G.spread) + "s", C.blue]);
		if (G.rapid > 0) pw.push(["[R] " + Math.ceil(G.rapid) + "s", C.green]);
		pw.forEach(function(w, i){ txt(w[0], 1 + i * 9, FH - RH - 0.6, w[1]); });
		if (b && !b.dying && b.y > -4){
			var n = 30, f = Math.round(n * Math.max(0, b.hp) / b.max);
			txt("ROOT BUG", COLS / 2 - 20, 0.8 + RH * 2.2, C.purple);
			txt("[" + rep("#", f) + rep("-", n - f) + "]", COLS / 2 - 11, 0.8 + RH * 2.2, C.red);
		}
	}

	function ptr(type, x, y, dx, dy, o){
		if (type !== "move" || !o.down || !G.player) return;
		var p = G.player, s = o.touch ? 1.5 : 1;
		p.x = clamp(p.x + dx * s, 0, COLS - p.w);
		p.y = clamp(p.y + dy * s, FH * 0.3, FH - p.h - 0.5);
	}

	return {
		id: "bughunt", name: "BUGHUNT", tag: "shoot the bugs before they crash the site", cols: 56, aspect: 1.45, hiKey: "ayka-game-hi",
		controls: [["move", "arrows · zqsd · wasd · drag"], ["fire", "automatic"], ["bonus", "[S] spread  [R] rapid  [+] life  [B] bomb"]],
		legend: [["{*} 100", C.green], ["/^^\\ 200", C.blue], ["\\!/ 150", C.red], ["#%# 300", C.purple]],
		start: start, update: update, draw: draw, ptr: ptr,
		resize: function(){ if (G.player) G.player.y = clamp(G.player.y, FH * 0.3, FH - G.player.h - 0.5); },
		overLines: function(){ return ["wave " + pad(G.wave, 2)]; },
		title: function(){ updateStars(0.016); drawStars(); }
	};
})();

/* ================= SERPENT: grid snake with levels, walls, portals ================= */
function hex2rgb(h){ var n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function lerpCol(a, b, k){
	var A = hex2rgb(a), B = hex2rgb(b);
	return "rgb(" + Math.round(A[0] + (B[0] - A[0]) * k) + "," + Math.round(A[1] + (B[1] - A[1]) * k) + "," + Math.round(A[2] + (B[2] - A[2]) * k) + ")";
}
function ramp(k){ var s = [C.green, C.blue, C.purple, C.red]; k = clamp(k, 0, 0.999) * (s.length - 1); var i = Math.floor(k); return lerpCol(s[i], s[i + 1], k - i); }

var SERPENT = (function(){
	var GW = 30, GH = 20, TOP = 2, S = {};
	var EAT = [64, 66, 68, 71, 73, 76, 78, 80, 83, 85, 88];
	function X(c){ return c * 2; }
	function Y(r){ return (r + TOP) * RH; }
	function key(c, r){ return c + "," + r; }
	function onSnake(c, r, skipTail){
		for (var i = 0; i < S.snake.length - (skipTail ? 1 : 0); i++) if (S.snake[i].c === c && S.snake[i].r === r) return true;
		return false;
	}
	function isItem(c, r){
		return [S.food, S.gold, S.slow].some(function(it){ return it && it.c === c && it.r === r; }) ||
			(S.portals && S.portals.some(function(p){ return p.c === c && p.r === r; }));
	}
	function free(c, r){ return c > 0 && r > 0 && c < GW - 1 && r < GH - 1 && !S.blocks[key(c, r)] && !onSnake(c, r) && !isItem(c, r); }
	function rndFree(margin){
		var h = S.snake[0];
		for (var t = 0; t < 600; t++){
			var c = irnd(1, GW - 2), r = irnd(1, GH - 2);
			if (free(c, r) && Math.abs(c - h.c) + Math.abs(r - h.r) >= (margin || 0)) return { c: c, r: r, t: 0 };
		}
		return null;
	}
	function start(){
		S = { snake: [{ c: 9, r: 10 }, { c: 8, r: 10 }, { c: 7, r: 10 }, { c: 6, r: 10 }], dir: { x: 1, y: 0 }, q: [], tick: 0, iv: 0.12,
			level: 1, eaten: 0, score: 0, blocks: {}, food: null, gold: null, slow: null, slowT: 0, portals: null, grow: 0, dying: -1, streak: 0, lastEat: 0, t: 0 };
		S.food = rndFree(3);
		banner("LEVEL 1", C.hi, 1.3);
	}
	function turn(x, y){
		var last = S.q.length ? S.q[S.q.length - 1] : S.dir;
		if ((x === -last.x && y === -last.y) || (x === last.x && y === last.y) || S.q.length > 2) return;
		S.q.push({ x: x, y: y });
		SFX.move();
	}
	function levelUp(){
		S.level++;
		S.iv = Math.max(0.055, S.iv * 0.9);
		var n = 2 + S.level;
		for (var i = 0; i < n; i++){
			var p = rndFree(6);
			if (!p) break;
			S.blocks[key(p.c, p.r)] = 1;
			if (Math.random() < 0.5){ var q = { c: p.c + pick([-1, 1]), r: p.r }; if (free(q.c, q.r)) S.blocks[key(q.c, q.r)] = 1; }
		}
		if (S.level >= 3){
			var a = rndFree(5), b = a && rndFree(5);
			if (a && b) S.portals = [a, b];
		}
		banner("LEVEL " + S.level, C.green, 1.4);
		SFX.level();
		flash(0.25);
	}
	function eat(it, kind){
		var cx = X(it.c) + 1, cy = Y(it.r) + RH / 2;
		S.streak = S.t - S.lastEat < 3 ? S.streak + 1 : 0;
		S.lastEat = S.t;
		var mult = 1 + Math.min(4, S.streak) * 0.5;
		if (kind === "food"){
			var pts = Math.round(10 * S.level * mult);
			S.score += pts; S.eaten++; S.grow += 1;
			pop(cx, cy - 1, "+" + pts, S.streak ? C.yellow : C.fg);
			burst(cx, cy, C.yellow, 10, 14, ["0", "1"]);
			SFX.eat(EAT[S.eaten % EAT.length]);
			S.food = rndFree(3);
			if (!S.gold && Math.random() < 0.22) S.gold = rndFree(6);
			if (!S.slow && S.level >= 2 && Math.random() < 0.08) S.slow = rndFree(6);
			if (S.eaten % 6 === 0) levelUp();
		}
		else if (kind === "gold"){
			var g = 60 * S.level;
			S.score += g; S.grow += 3; S.gold = null;
			pop(cx, cy - 1, "+" + g, C.orange);
			burst(cx, cy, C.orange, 22, 20, ["$", "*", "+"]);
			SFX.coin(); shake(3);
		}
		else {
			S.slowT = 7; S.slow = null;
			pop(cx, cy - 1, "slow-mo", C.blue);
			burst(cx, cy, C.blue, 16, 16);
			SFX.power();
		}
	}
	function die(){
		S.dying = 0;
		shake(8); flash(0.35);
		SFX.hurt();
	}
	function step(){
		if (S.q.length) S.dir = S.q.shift();
		var h = S.snake[0], c = h.c + S.dir.x, r = h.r + S.dir.y;
		if (S.portals){
			for (var i = 0; i < 2; i++){
				var p = S.portals[i];
				if (p.c === c && p.r === r){
					var o = S.portals[1 - i];
					c = o.c + S.dir.x; r = o.r + S.dir.y;
					burst(X(o.c) + 1, Y(o.r) + RH / 2, C.purple, 10, 12);
					SFX.blip();
					break;
				}
			}
		}
		if (c <= 0 || r <= 0 || c >= GW - 1 || r >= GH - 1 || S.blocks[key(c, r)] || onSnake(c, r, S.grow === 0)){ die(); return; }
		S.snake.unshift({ c: c, r: r });
		if (S.grow > 0) S.grow--; else S.snake.pop();
		if (S.food && S.food.c === c && S.food.r === r) eat(S.food, "food");
		else if (S.gold && S.gold.c === c && S.gold.r === r) eat(S.gold, "gold");
		else if (S.slow && S.slow.c === c && S.slow.r === r) eat(S.slow, "slow");
	}
	function update(dt){
		S.t += dt;
		if (S.dying >= 0){
			S.dying += dt;
			var n = Math.floor(S.dying / 0.035);
			while (S.snake.length && n > (S.boomed || 0)){
				var s = S.snake.shift();
				S.boomed = (S.boomed || 0) + 1;
				burst(X(s.c) + 1, Y(s.r) + RH / 2, ramp(S.boomed / 30), 6, 14);
				if (S.boomed % 3 === 1) SFX.hit();
			}
			if (!S.snake.length && S.dying > 0.6 + (S.boomed || 0) * 0.035){ S.dying = -2; gameOver(S.score); }
			return;
		}
		if (S.dying === -2) return;
		S.slowT = Math.max(0, S.slowT - dt);
		var iv = S.iv * (S.slowT > 0 ? 1.7 : 1);
		S.tick += dt;
		while (S.tick >= iv && S.dying < 0){ S.tick -= iv; step(); }
		[["gold", 7], ["slow", 8]].forEach(function(k){ var it = S[k[0]]; if (it && (it.t += dt) > k[1]) S[k[0]] = null; });
	}
	function draw(){
		/* frame */
		var wall = C.line;
		for (var c = 0; c < GW; c++){ txt("::", X(c), Y(0), wall); txt("::", X(c), Y(GH - 1), wall); }
		for (var r = 1; r < GH - 1; r++){ txt("::", 0, Y(r), wall); txt("::", X(GW - 1), Y(r), wall); }
		for (var k in S.blocks){ var p = k.split(","); txt("##", X(+p[0]), Y(+p[1]), C.mid); }
		if (S.portals){
			glow(C.purple, 12);
			S.portals.forEach(function(p, i){ txt(Math.floor(T * 4 + i) % 2 ? "()" : "{}", X(p.c), Y(p.r), C.purple); });
			noGlow();
		}
		if (S.food){ glow(C.yellow, 10); txt(Math.floor(T * 3) % 2 ? "01" : "10", X(S.food.c), Y(S.food.r), C.yellow); noGlow(); }
		if (S.gold && !(S.gold.t > 5 && Math.floor(T * 10) % 2)){ glow(C.orange, 14); txt("$$", X(S.gold.c), Y(S.gold.r), C.orange); noGlow(); }
		if (S.slow && !(S.slow.t > 6 && Math.floor(T * 10) % 2)){ glow(C.blue, 12); txt("<>", X(S.slow.c), Y(S.slow.r), C.blue); noGlow(); }

		var n = S.snake.length;
		for (var i = n - 1; i >= 0; i--){
			var s = S.snake[i], col = ramp(i / Math.max(12, n));
			if (i === 0){
				glow(C.green, 12);
				var d = S.dir, face = d.x > 0 ? "[:" : d.x < 0 ? ":]" : d.y < 0 ? "''" : "..";
				txt(face, X(s.c), Y(s.r), C.hi);
				noGlow();
			}
			else txt(i % 2 ? "[]" : "()", X(s.c), Y(s.r), col);
		}
		drawFx();

		txt("SCORE " + pad(S.score, 6), 0, 0, C.fg);
		txt("HI " + pad(Math.max(hiOf(SERPENT), S.score), 6), 18, 0, C.dim);
		txt("LVL " + pad(S.level, 2), 34, 0, C.green);
		txt("LEN " + pad(S.snake.length, 3), 44, 0, C.dim);
		if (S.slowT > 0) txt("slow " + Math.ceil(S.slowT) + "s", 52, 0, C.blue);
		if (S.streak > 0 && S.t - S.lastEat < 3) txt("x" + (1 + Math.min(4, S.streak) * 0.5).toFixed(1), 30, Y(GH), C.yellow);
	}
	var sw = null;
	function ptr(type, x, y){
		if (type === "down") sw = { x: x, y: y };
		else if (type === "up") sw = null;
		else if (type === "move" && sw){
			var dx = x - sw.x, dy = (y - sw.y) / 1.6;
			if (Math.max(Math.abs(dx), Math.abs(dy)) > 2.5){
				if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0); else turn(0, dy > 0 ? 1 : -1);
				sw = { x: x, y: y };
			}
		}
	}
	var DIRS = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
	return {
		id: "serpent", name: "SERPENT", tag: "eat the bytes, don't eat yourself", cols: 60, rows: 23,
		controls: [["move", "arrows · zqsd · wasd · swipe"], ["items", "01 food  $$ gold  <> slow-mo  () portal"], ["tip", "eat fast to chain a multiplier"]],
		start: start, update: update, draw: draw, ptr: ptr,
		key: function(e, down){ var d = DIRS[e.code]; if (d && down && S.dying < 0){ turn(d[0], d[1]); return true; } return !!d; },
		overLines: function(){ return ["level " + S.level + "   ·   length " + (S.boomed || 0)]; }
	};
})();

/* ================= BREAKER: paddle + ball, bricks made of code ================= */
var BREAKER = (function(){
	var B = {}, NB = 11, BW = 5;
	var LEVELS = [
		["...........",
		 ".nnnnnnnnn.",
		 ".nnnnnnnnn.",
		 ".nnnnnnnnn.",
		 ".nnnnnnnnn."],
		["s.s.s.s.s.s",
		 "nnnnnnnnnnn",
		 ".nnnnnnnnn.",
		 "..nnnnnnn..",
		 "...nnennn..",
		 "....nnn...."],
		["xnnnnxnnnnx",
		 "nsssnnnsssn",
		 "nnennnnnenn",
		 "nsssnnnsssn",
		 "xnnnnxnnnnx"],
		["...sssss...",
		 ".ssnnnnnss.",
		 "snnn.e.nnns",
		 "snn.eee.nns",
		 "snnn.e.nnns",
		 ".ssnnnnnss.",
		 "...sssss..."],
		["nxnxnxnxnxn",
		 "nnnnnnnnnnn",
		 "sesesesesss",
		 "nnnnnnnnnnn",
		 "xnxnxnxnxnx",
		 "nnnnnnnnnnn"],
		["eeeeeeeeeee",
		 "sssssssssss",
		 "nnnnnnnnnnn",
		 "nnnnnnnnnnn",
		 "xx.xxxxx.xx",
		 "sssssssssss",
		 "nnnnnnnnnnn"]
	];
	var TOK = ["func", "null", "void", "else", "true", "0x0F", "i++;", "&&||", "enum", "goto", "char", "bool", "try{", "=>()", "NaN!", "</> ", "git ", "sudo", "let ", "self", "this", "nil ", "ret;", "0b11"];
	var ROWC = [C.green, C.blue, C.purple, C.red, C.orange, C.yellow, C.green];
	var PU = { M: { col: C.blue, name: "multiball" }, W: { col: C.green, name: "wide paddle" }, L: { col: C.red, name: "laser" },
		S: { col: C.purple, name: "slow ball" }, "+": { col: C.red, name: "+1 life" }, "-": { col: C.dim, name: "tiny paddle" } };

	function top(){ return 3 * RH; }
	function brickRect(b){ return { x: 0.5 + b.c * BW, y: top() + b.r * RH * 1.15, w: BW, h: RH * 1.1 }; }
	function build(){
		var map = LEVELS[(B.level - 1) % LEVELS.length];
		B.bricks = [];
		map.forEach(function(row, r){
			for (var c = 0; c < NB; c++){
				var t = row[c];
				if (t === ".") continue;
				B.bricks.push({ c: c, r: r, t: t, hp: t === "s" ? 2 : t === "x" ? 1e9 : 1, tok: t === "x" ? "####" : t === "e" ? "[**]" : pick(TOK), col: ROWC[r % ROWC.length], hit: 0 });
			}
		});
	}
	function speed(){ return (30 + B.level * 2.2 + Math.min(14, B.hits * 0.12)) * (B.slowT > 0 ? 0.65 : 1); }
	function newBall(stuck){ return { x: B.px + B.pw / 2, y: B.py - RH * 0.6, vx: 0, vy: 0, stuck: stuck, off: rnd(-0.3, 0.3) }; }
	function pw(){ return B.wideT > 0 ? 13 : B.tinyT > 0 ? 6 : 9; }
	function start(){
		B = { level: 1, score: 0, lives: 3, hits: 0, chain: 0, pups: [], lasers: [], wideT: 0, tinyT: 0, laserT: 0, slowT: 0, fireT: 0, clearT: 0, autoT: 0 };
		B.pw = 9; B.px = COLS / 2 - 4.5; B.py = FH - 3 * RH;
		build();
		B.balls = [newBall(true)];
		banner("LEVEL 1", C.hi, 1.4);
	}
	function launch(){
		B.balls.forEach(function(b){
			if (!b.stuck) return;
			b.stuck = false;
			var a = b.off * 0.9, v = speed();
			b.vx = Math.sin(a) * v; b.vy = -Math.cos(a) * v;
			SFX.bounce(520);
		});
	}
	function breakable(){ return B.bricks.some(function(b){ return b.t !== "x"; }); }
	function damage(b, chainOK){
		if (B.bricks.indexOf(b) < 0) return;
		if (b.t === "x"){ SFX.clink(); b.hit = 0.15; return; }
		b.hp--; b.hit = 0.12;
		var R = brickRect(b), cx = R.x + R.w / 2, cy = R.y + R.h / 2;
		if (b.hp > 0){ SFX.bounce(300 + (6 - b.r) * 40); return; }
		B.bricks.splice(B.bricks.indexOf(b), 1);
		if (chainOK) B.chain++;
		B.dry = 0;
		var pts = Math.round((b.t === "s" ? 25 : b.t === "e" ? 40 : 10) * B.level * (1 + Math.min(20, B.chain) * 0.1));
		B.score += pts;
		pop(cx, R.y, "+" + pts, B.chain > 4 ? C.yellow : C.fg);
		burst(cx, cy, b.col, 10, 16, b.tok.replace(/ /g, "").split(""));
		tone("square", mtof(76 + (6 - b.r) * 2 + Math.min(12, B.chain)), 0, 0.07, 0.07);
		if (Math.random() < 0.14) B.pups.push({ k: pick(["M", "W", "L", "S", "M", "W", "+", "-"]), x: cx - 1.5, y: cy, w: 3, h: RH });
		if (b.t === "e"){
			shake(6); SFX.boom();
			burst(cx, cy, C.orange, 26, 24);
			B.bricks.filter(function(o){ return Math.abs(o.c - b.c) <= 1 && Math.abs(o.r - b.r) <= 1 && o.t !== "x"; })
				.forEach(function(o){ o.hp = 1; damage(o, true); });
		}
	}
	function hitBrick(x, y, r){
		for (var i = 0; i < B.bricks.length; i++){
			var R = brickRect(B.bricks[i]);
			if (x + r > R.x && x - r < R.x + R.w && y + r * 1.2 > R.y && y - r * 1.2 < R.y + R.h) return B.bricks[i];
		}
		return null;
	}
	function loseBall(){
		B.lives--;
		B.chain = 0;
		shake(8); flash(0.3);
		SFX.hurt();
		B.wideT = B.tinyT = B.laserT = B.slowT = 0;
		if (B.lives <= 0){ gameOver(B.score); return; }
		B.balls = [newBall(true)];
		B.autoT = 0;
	}
	function update(dt){
		B.wideT = Math.max(0, B.wideT - dt); B.tinyT = Math.max(0, B.tinyT - dt);
		B.laserT = Math.max(0, B.laserT - dt); B.slowT = Math.max(0, B.slowT - dt);
		var target = pw();
		B.pw += (target - B.pw) * Math.min(1, dt * 12);
		var mv = (K.r ? 1 : 0) - (K.l ? 1 : 0);
		B.px = clamp(B.px + mv * 62 * dt, 0, COLS - B.pw);
		B.py = FH - 3 * RH;
		B.bricks.forEach(function(b){ b.hit = Math.max(0, b.hit - dt); });

		if (B.clearT){
			if ((B.clearT -= dt) <= 0){
				B.clearT = 0; B.level++; B.hits = 0; B.chain = 0;
				build(); B.balls = [newBall(true)]; B.pups = []; B.lasers = [];
				banner("LEVEL " + B.level, C.hi, 1.4);
			}
			return;
		}

		/* laser */
		if (B.laserT > 0 && (B.fireT -= dt) <= 0){
			B.fireT = 0.32;
			B.lasers.push({ x: B.px + 0.5, y: B.py - RH * 0.5 }, { x: B.px + B.pw - 1.5, y: B.py - RH * 0.5 });
			SFX.shoot();
		}
		B.lasers = B.lasers.filter(function(l){
			l.y -= 60 * dt;
			var b = hitBrick(l.x + 0.5, l.y + RH / 2, 0.2);
			if (b){ damage(b, false); return false; }
			return l.y > top() - RH;
		});

		var anyStuck = false;
		B.balls.forEach(function(b){
			if (b.stuck){ anyStuck = true; b.x = B.px + B.pw / 2 + b.off * B.pw * 0.4; b.y = B.py - RH * 0.6; return; }
			var v = speed(), cur = Math.hypot(b.vx, b.vy) || 1;
			b.vx *= v / cur; b.vy *= v / cur;
			var n = Math.ceil(v * dt / 0.35), sdt = dt / n, r = 0.45;
			for (var i = 0; i < n && !b.out; i++){
				b.x += b.vx * sdt;
				var hb = hitBrick(b.x, b.y, r);
				if (b.x < r || b.x > COLS - r){ b.vx = -b.vx; b.x = clamp(b.x, r, COLS - r); SFX.bounce(380); }
				else if (hb){ b.x -= b.vx * sdt; b.vx = -b.vx; damage(hb, true); }
				b.y += b.vy * sdt;
				hb = hitBrick(b.x, b.y, r);
				if (b.y < top() - RH * 0.6 + r){ b.vy = Math.abs(b.vy); SFX.bounce(380); }
				else if (hb){ b.y -= b.vy * sdt; b.vy = -b.vy; damage(hb, true); }
				/* paddle */
				if (b.vy > 0 && b.y + r * 1.2 >= B.py && b.y - r < B.py + RH * 0.8 && b.x > B.px - 0.6 && b.x < B.px + B.pw + 0.6){
					var off = clamp((b.x - (B.px + B.pw / 2)) / (B.pw / 2), -1, 1), dry = (B.dry || 0) > 5 ? 0.35 : 0.07, a = clamp(off * 1.05 + rnd(-dry, dry), -1.15, 1.15);
					b.vx = Math.sin(a) * v; b.vy = -Math.abs(Math.cos(a) * v);
					b.y = B.py - r * 1.2;
					B.hits++; B.chain = 0; B.dry = (B.dry || 0) + 1;
					SFX.bounce(440 + off * 120);
					burst(b.x, B.py, C.hi, 4, 8);
				}
				/* never get stuck flying flat */
				if (Math.abs(b.vy) < v * 0.22){ b.vy = (b.vy < 0 ? -1 : 1) * v * 0.22; }
				if (b.y > FH + 1) b.out = true;
			}
		});
		B.balls = B.balls.filter(function(b){ return !b.out; });
		if (!B.balls.length){ loseBall(); return; }
		if (anyStuck && (B.autoT += dt) > 4) launch();

		B.pups = B.pups.filter(function(u){
			u.y += 9 * dt;
			if (u.y + u.h > B.py && u.y < B.py + RH && u.x + u.w > B.px && u.x < B.px + B.pw){
				var P = PU[u.k];
				if (u.k === "M"){
					var src = B.balls[0];
					for (var i = 0; i < 2; i++){
						var nb = { x: src.x, y: src.y, vx: 0, vy: 0, stuck: false }, a = rnd(-0.9, 0.9);
						nb.vx = Math.sin(a) * speed(); nb.vy = -Math.cos(a) * speed();
						if (src.stuck){ nb.y = B.py - RH; }
						B.balls.push(nb);
					}
				}
				else if (u.k === "W"){ B.wideT = 15; B.tinyT = 0; }
				else if (u.k === "-"){ B.tinyT = 10; B.wideT = 0; }
				else if (u.k === "L"){ B.laserT = 10; }
				else if (u.k === "S"){ B.slowT = 10; }
				else B.lives = Math.min(5, B.lives + 1);
				pop(u.x + 1.5, u.y - 1, P.name, P.col);
				if (u.k === "-") SFX.err(); else SFX.power();
				B.score += 50;
				return false;
			}
			return u.y < FH + 1;
		});

		if (!breakable()){
			B.clearT = 1.8;
			var bonus = 1000 * B.level + B.lives * 250;
			B.score += bonus;
			banner("LEVEL CLEAR  +" + bonus, C.green, 1.8);
			SFX.level(); flash(0.3);
		}
	}
	function draw(){
		B.bricks.forEach(function(b){
			var R = brickRect(b), col = b.t === "x" ? C.mid : b.t === "e" ? C.orange : b.col;
			if (b.hit > 0) col = C.hi;
			rectU(R.x + 0.2, R.y + 0.2, R.w - 0.4, R.h - 0.4, col, b.t === "x" ? 0.12 : 0.1);
			var t = b.t === "s" ? (b.hp > 1 ? "[==]" : "[/=]") : b.tok;
			if (b.t === "e") glow(C.orange, 8);
			txt(t, R.x + 0.5, R.y + (R.h - RH) / 2, col);
			noGlow();
		});
		B.pups.forEach(function(u){ glow(PU[u.k].col, 10); txt("[" + u.k + "]", u.x, u.y, PU[u.k].col); noGlow(); });
		glow(C.red, 8);
		B.lasers.forEach(function(l){ txt("|", l.x, l.y, C.red); });
		noGlow();

		var w = Math.round(B.pw);
		glow(B.laserT > 0 ? C.red : C.green, 12);
		txt("[" + rep(B.laserT > 0 ? "^" : "=", w - 2) + "]", B.px, B.py, B.tinyT > 0 ? C.dim : C.hi);
		noGlow();
		glow(C.hi, 10);
		B.balls.forEach(function(b){ txt("o", b.x - 0.5, b.y - RH / 2, C.hi); });
		noGlow();
		drawFx();

		txt("SCORE " + pad(B.score, 7), 1, 0.6, C.fg);
		txt("HI " + pad(Math.max(hiOf(BREAKER), B.score), 7), 20, 0.6, C.dim);
		txt("LVL " + pad(B.level, 2), 36, 0.6, C.green);
		var hearts = "";
		for (var i = 0; i < 5; i++) hearts += i < B.lives ? "♥" : " ";
		txt(hearts, COLS - 6, 0.6, C.red);
		ctx.globalAlpha = 1; ctx.fillStyle = C.line; ctx.fillRect(ox, oy + (top() - RH * 0.7) * cw, COLS * cw, 1);
		var st = [];
		if (B.wideT > 0) st.push(["wide " + Math.ceil(B.wideT), C.green]);
		if (B.laserT > 0) st.push(["laser " + Math.ceil(B.laserT), C.red]);
		if (B.slowT > 0) st.push(["slow " + Math.ceil(B.slowT), C.purple]);
		if (B.chain > 2) st.push(["chain x" + (1 + Math.min(20, B.chain) * 0.1).toFixed(1), C.yellow]);
		st.forEach(function(s, i){ txt(s[0], 1 + i * 12, FH - RH - 0.3, s[1]); });
		if (B.balls.some(function(b){ return b.stuck; }) && Math.floor(T * 2) % 2) center("space / click to launch", B.py - RH * 3, C.dim);
	}
	function ptr(type, x, y, dx, dy, o){
		if (type === "move"){ B.px = clamp(x - B.pw / 2, 0, COLS - B.pw); }
		else if (type === "down"){ B.px = clamp(x - B.pw / 2, 0, COLS - B.pw); if (!o.touch) launch(); else B.touchLaunch = true; }
		else if (type === "up" && B.touchLaunch){ B.touchLaunch = false; launch(); }
	}
	return {
		id: "breaker", name: "BREAKER", tag: "break the code, keep the ball", cols: 56, aspect: 1.25,
		controls: [["move", "arrows · qd · ad · mouse · drag"], ["launch", "space · click · tap"], ["bonus", "[M]ulti [W]ide [L]aser [S]low [+]life [-]tiny"]],
		start: start, update: update, draw: draw, ptr: ptr,
		key: function(e, down){ if (e.code === "Space"){ if (down) launch(); return true; } return false; },
		resize: function(){ if (B.balls) B.py = FH - 3 * RH; },
		overLines: function(){ return ["level " + B.level]; }
	};
})();

/* ================= TYPE RUSH: type the falling commands before they hit the prompt ================= */
var TYPERUSH = (function(){
	var R = {};
	var SHORT = ["ls", "cd", "cat", "rm", "git", "npm", "ssh", "vim", "top", "sudo", "grep", "curl", "ping", "echo", "exit", "make", "node", "kill", "man", "pwd",
		"tar", "zip", "fork", "null", "void", "heap", "hash", "pipe", "bash", "root", "cron", "nano", "diff", "bug", "fix", "ship", "dns", "tcp", "udp", "jwt",
		"json", "yaml", "rust", "go", "lua", "c++", "int", "char", "bool", "enum", "this", "self", "async", "await", "const", "let", "yield"];
	var MID = ["git push", "git pull", "npm i", "ls -la", "cd ..", "chmod +x", "mkdir src", "touch .env", "kill -9", "whoami", "ip a", "sudo !!", "docker ps",
		"git stash", "git rebase", "malloc", "segfault", "undefined", "callback", "promise", "mutex", "thread", "kernel", "daemon", "socket", "buffer",
		"overflow", "compile", "linker", "hexdump", "ghidra", "x64dbg", "wireshark", "payload", "breakpoint", "debugger", "deploy", "hotfix", "commit",
		"merge", "branch", "lambda", "regex", "printf", "stdout", "stdin", "stderr", "python3", "cargo run", "go build", "pip install", "htop", "uptime",
		"localhost", "127.0.0.1", "0xdeadbeef", "nullptr", "try catch", "while true", "return 0", "exit 1", ":wq", ":q!", "ctrl+c", "cron job"];
	var LONG = ["git commit -m fix", "npm run build", "docker compose up", "git checkout main", "sudo apt update", "ssh root@ayka.dev", "chmod 755 run.sh",
		"git log --oneline", "curl -s api/stats", "python3 -m http.server", "kubectl get pods", "cargo build --release", "find . -name *.js",
		"grep -rn TODO src", "tail -f error.log", "git push --force", "rm node_modules", "ps aux | grep node"];
	var BOSS = ["sudo apt-get update && sudo apt-get upgrade -y", "git add . && git commit -m 'final fix' && git push",
		"for i in $(seq 1 10); do echo $i; done", "docker run -it --rm -p 8080:80 nginx", "while true; do curl -s ayka.dev; done"];
	var SPECIAL = {
		bomb: { col: C.red, words: ["rm -rf /", "kill -9 -1", "shutdown now", ":(){ :|:& };:"], hint: "clears the screen" },
		slow: { col: C.blue, words: ["sleep 5", "nice -n 19", "wait", "pause"], hint: "slows everything" },
		heal: { col: C.green, words: ["fsck", "git revert", "undo", "reboot"], hint: "+1 life" }
	};
	function lineY(){ return FH - 2.6 * RH; }
	function start(){
		R = { words: [], target: null, score: 0, lives: 3, wave: 1, cleared: 0, combo: 0, spawnT: 1, slowT: 0, errT: 0,
			good: 0, bad: 0, t0: 0, t: 0, used: {}, bossDone: false };
		banner("WAVE 1", C.hi, 1.4);
	}
	function pool(){
		var w = R.wave;
		if (w <= 1) return SHORT;
		if (w <= 3) return Math.random() < 0.6 ? SHORT : MID;
		if (w <= 5) return Math.random() < 0.3 ? SHORT : Math.random() < 0.75 ? MID : LONG;
		return Math.random() < 0.2 ? SHORT : Math.random() < 0.6 ? MID : LONG;
	}
	function spawn(text, kind){
		var tries = 0, x;
		do { x = rnd(1, Math.max(1.5, COLS - text.length - 1)); tries++; }
		while (tries < 20 && R.words.some(function(o){ return o.y < RH * 3 && x < o.x + o.text.length + 2 && x + text.length + 2 > o.x; }));
		var v = (kind === "boss" ? 1.6 : 3.2 + R.wave * 0.55) * rnd(0.85, 1.15);
		R.words.push({ text: text, x: x, y: -RH, v: v, typed: 0, kind: kind || "n", col: kind && SPECIAL[kind] ? SPECIAL[kind].col : kind === "boss" ? C.purple : C.fg });
	}
	function spawnNext(){
		var r = Math.random();
		if (R.wave >= 2 && r < 0.05) return spawn(pick(SPECIAL.bomb.words), "bomb");
		if (R.wave >= 2 && r < 0.09) return spawn(pick(SPECIAL.slow.words), "slow");
		if (R.wave >= 3 && r < 0.12 && R.lives < 3) return spawn(pick(SPECIAL.heal.words), "heal");
		var p = pool(), w, t = 0;
		do { w = pick(p); t++; } while (t < 10 && (R.used[w] || R.words.some(function(o){ return o.text[0] === w[0]; })));
		R.used[w] = 1;
		if (Object.keys(R.used).length > 40) R.used = {};
		spawn(w);
	}
	function finish(w){
		R.words.splice(R.words.indexOf(w), 1);
		R.target = null;
		R.combo++; R.cleared++;
		var pts = Math.round(w.text.length * 10 * (1 + Math.min(30, R.combo) * 0.1) * (1 + R.wave * 0.1) * (w.kind === "boss" ? 3 : 1));
		R.score += pts;
		var cx = w.x + w.text.length / 2;
		pop(cx, w.y - 1, "+" + pts, R.combo > 4 ? C.yellow : C.fg);
		burst(cx, w.y + RH / 2, w.col === C.fg ? C.green : w.col, Math.min(40, 6 + w.text.length * 2), 18, w.text.replace(/ /g, "").split(""));
		tone("square", mtof(76 + Math.min(14, R.combo)), 0, 0.08, 0.06);
		if (w.kind === "bomb"){
			R.words.slice().forEach(function(o){ R.score += o.text.length * 10; burst(o.x + o.text.length / 2, o.y + RH / 2, C.red, 12, 20); });
			R.words = [];
			flash(0.8); shake(10); SFX.bigboom();
		}
		else if (w.kind === "slow"){ R.slowT = 6; SFX.power(); pop(cx, w.y - 2.5, "slow-mo", C.blue); }
		else if (w.kind === "heal"){ R.lives = Math.min(5, R.lives + 1); SFX.power(); pop(cx, w.y - 2.5, "+1 life", C.green); }
		else if (w.kind === "boss"){ SFX.bigboom(); shake(8); flash(0.4); }
		if (R.cleared % 12 === 0){
			R.wave++;
			banner("WAVE " + R.wave, C.hi, 1.4);
			SFX.level();
			if (R.wave % 4 === 0) setTimeout(function(){ if (mode === "play" && cur === TYPERUSH) { spawn(pick(BOSS), "boss"); banner("!! LONG COMMAND !!", C.purple, 1.6); } }, 900);
		}
	}
	function error(){
		R.bad++; R.combo = 0; R.errT = 0.25;
		SFX.err(); shake(1.5);
	}
	function text(ch){
		if (mode !== "play") return;
		ch = ch.toLowerCase();
		if (!R.t0) R.t0 = R.t;
		if (!R.target){
			var c = R.words.filter(function(w){ return w.text[0].toLowerCase() === ch; });
			if (!c.length){ if (ch !== " ") error(); return; }
			c.sort(function(a, b){ return b.y - a.y; });
			R.target = c[0];
			R.target.typed = 1;
		}
		else if (R.target.text[R.target.typed].toLowerCase() === ch) R.target.typed++;
		else { error(); return; }
		R.good++;
		SFX.key();
		if (R.target.typed >= R.target.text.length) finish(R.target);
	}
	function back(){
		if (!R.target) return;
		R.target.typed--;
		if (R.target.typed <= 0){ R.target.typed = 0; R.target = null; }
		SFX.key();
	}
	function crash(w){
		R.words.splice(R.words.indexOf(w), 1);
		if (R.target === w) R.target = null;
		R.lives--; R.combo = 0;
		burst(w.x + w.text.length / 2, lineY(), C.red, 30, 26);
		shake(9); flash(0.4); SFX.hurt();
		if (R.lives <= 0) gameOver(R.score);
	}
	function wpm(){ var m = (R.t - R.t0) / 60; return R.t0 && m > 0.05 ? Math.round(R.good / 5 / m) : 0; }
	function update(dt){
		R.t += dt;
		R.errT = Math.max(0, R.errT - dt);
		R.slowT = Math.max(0, R.slowT - dt);
		var k = R.slowT > 0 ? 0.35 : 1;
		if ((R.spawnT -= dt * k) <= 0){
			spawnNext();
			R.spawnT = Math.max(0.75, 2.6 - R.wave * 0.17) * rnd(0.75, 1.25);
		}
		R.words.slice().forEach(function(w){
			w.y += w.v * dt * k * (R.target === w ? 0.85 : 1);
			if (w.y + RH > lineY() && mode === "play") crash(w);
		});
	}
	function draw(){
		var ly = lineY();
		/* danger zone glow */
		var near = R.words.reduce(function(m, w){ return Math.max(m, w.y / ly); }, 0);
		if (near > 0.7){ rectU(0, ly - RH * 4, COLS, RH * 4, C.red, (near - 0.7) * 0.25 * (0.6 + Math.sin(T * 10) * 0.4)); }
		R.words.forEach(function(w){
			var tgt = w === R.target;
			if (tgt){ glow(C.green, 12); txt(">", w.x - 1.5, w.y, C.green); }
			else if (w.kind !== "n") glow(w.col, 8);
			if (w.typed) txt(w.text.slice(0, w.typed), w.x, w.y, C.green);
			txt(w.text.slice(w.typed), w.x + w.typed, w.y, tgt ? C.hi : w.col, tgt ? 1 : 0.55 + 0.45 * clamp(w.y / ly, 0, 1));
			noGlow();
			if (w.kind === "boss") txt(rep("~", w.text.length), w.x, w.y + RH * 0.8, C.purple, 0.4);
		});
		drawFx();
		ctx.globalAlpha = 1;
		txt(rep("─", COLS), 0, ly, R.errT > 0 ? C.red : C.line);
		var typed = R.target ? R.target.text.slice(0, R.target.typed) : "";
		txt("ayka@dev:~$ ", 1, ly + RH * 1.1, C.green);
		txt(typed + (Math.floor(T * 2) % 2 ? "_" : " "), 13, ly + RH * 1.1, R.errT > 0 ? C.red : C.hi);

		txt("SCORE " + pad(R.score, 7), 1, 0.6, C.fg);
		txt("HI " + pad(Math.max(hiOf(TYPERUSH), R.score), 7), 1, 0.6 + RH, C.dim);
		txt("WAVE " + pad(R.wave, 2), 23, 0.6, C.green);
		txt(wpm() + " wpm", 23, 0.6 + RH, C.dim);
		var hearts = "";
		for (var i = 0; i < 5; i++) hearts += i < R.lives ? "♥" : " ";
		txt(hearts, COLS - 6, 0.6, C.red);
		if (R.combo > 2) txt("x" + (1 + Math.min(30, R.combo) * 0.1).toFixed(1), COLS - 6, 0.6 + RH, C.yellow);
		if (R.slowT > 0) txt("slow-mo " + Math.ceil(R.slowT) + "s", 36, 0.6, C.blue);
	}
	return {
		id: "typerush", name: "TYPE RUSH", tag: "type the commands before they hit the prompt", cols: 56, aspect: 1.3, wantsText: true,
		controls: [["type", "just type, it locks onto the word"], ["fix", "backspace"], ["red", "rm -rf / ... clears the screen"], ["blue", "sleep 5 ... slows time"], ["green", "fsck ... +1 life"]],
		start: start, update: update, draw: draw, text: text,
		key: function(e, down){ if (e.key === "Backspace"){ if (down) back(); e.preventDefault(); return true; } return false; },
		overLines: function(){
			var acc = R.good + R.bad ? Math.round(R.good / (R.good + R.bad) * 100) : 100;
			return ["wave " + R.wave + "   ·   " + wpm() + " wpm   ·   " + acc + "% accuracy"];
		}
	};
})();

/* ================= RUNNER: endless runner on a command line ================= */
var RUNNER = (function(){
	var P = {}, PX = 8;
	var RUN = [[" o ", "/|\\", "/ \\"], [" o ", "/|\\", " |\\"], [" o ", "/|\\", " | "], [" o ", "/|\\", "/| "]];
	var JUMP = ["\\o/", " | ", "/ \\"], FALL = [" o ", "/|\\", "| |"], DUCK = ["__o", "/\\ "], DEAD = ["   ", " x ", "/_\\"];
	var OBS = {
		small: { spr: ["{#}"], col: C.red },
		tall:  { spr: ["|#|", "|#|"], col: C.orange },
		wide:  { spr: ["{##}{##}"], col: C.red },
		wall:  { spr: ["/\\/\\", "|##|", "|##|"], col: C.purple },
		drone: { spr: ["<=o=>"], col: C.blue, fly: true }
	};
	function gY(){ return FH - 4 * RH; }
	function start(){
		P = { y: 0, vy: 0, ground: true, duck: false, hold: false, speed: 26, dist: 0, coins: 0, obs: [], bits: [], pits: [], nextT: 1.2,
			anim: 0, dead: 0, gOff: 0, sky: [], mile: 250, t: 0 };
		P.y = gY();
		for (var x = 0; x < COLS * 3; ){ var w = irnd(3, 7); P.sky.push({ x: x, w: w, h: irnd(2, 7) }); x += w + irnd(0, 3); }
	}
	function score(){ return Math.floor(P.dist) + P.coins * 25; }
	function overPit(){ var cx = PX + 1.5; return P.pits.some(function(p){ return cx > p.x + 0.6 && cx < p.x + p.w - 0.6; }); }
	function jump(){
		if (P.dead) return;
		if (P.ground){ P.vy = -62; P.ground = false; P.hold = true; SFX.jump(); burst(PX + 1.5, P.y, C.dim, 5, 6, [".", "'"]); }
	}
	function release(){ P.hold = false; if (P.vy < -20) P.vy *= 0.5; }
	function spawn(){
		var s = P.speed, r = Math.random(), x = COLS + 2;
		var lvl = Math.min(1, P.dist / 2500);
		if (P.dist > 150 && r < 0.14 + lvl * 0.08){ var w = rnd(6, 9 + lvl * 4); P.pits.push({ x: x, w: w }); addBits(x + w / 2 - 2, gY() - 6 * RH, 3); }
		else if (P.dist > 300 && r < 0.32){ P.obs.push(mk("drone", x, gY() - 2.3 * RH)); if (Math.random() < 0.5) addBits(x, gY() - 0.5 * RH - RH, 4); }
		else {
			var t = pick(P.dist < 200 ? ["small", "small", "tall"] : P.dist < 800 ? ["small", "tall", "wide", "tall"] : ["small", "tall", "wide", "wall", "wall"]);
			P.obs.push(mk(t, x));
			if (P.dist > 600 && Math.random() < 0.3 + lvl * 0.3) P.obs.push(mk("small", x + rnd(9, 12)));
			if (Math.random() < 0.4) addBits(x - 1, gY() - 7 * RH, 3);
		}
		if (Math.random() < 0.25) addBits(x + 14, gY() - RH * rnd(1.2, 4), irnd(3, 6));
		P.nextT = rnd(0.75, 1.5) * clamp(36 / s, 0.6, 1.3);
	}
	function mk(type, x, y){
		var O = OBS[type];
		return { type: type, O: O, x: x, w: O.spr[0].length, h: O.spr.length * RH, y: y == null ? gY() - O.spr.length * RH : y - O.spr.length * RH };
	}
	function addBits(x, y, n){ for (var i = 0; i < n; i++) P.bits.push({ x: x + i * 2.5, y: y, ph: i * 0.6 }); }
	function die(){
		if (P.dead) return;
		P.dead = 0.001;
		shake(10); flash(0.5);
		burst(PX + 1.5, P.y - RH, C.red, 30, 26);
		SFX.boom(); SFX.hurt();
	}
	function hitbox(){
		var h = P.duck && P.ground ? 2 * RH : 3 * RH;
		return { x: PX + 0.5, y: P.y - h + 0.5, w: 2, h: h - 0.6 };
	}
	function update(dt){
		if (P.dead >= 99) return;
		P.t += dt;
		if (P.dead){
			P.dead += dt;
			dt *= 0.25;
			if (P.dead > 1){ P.dead = 99; gameOver(score()); return; }
		}
		P.speed = Math.min(72, 26 + P.t * 0.45);
		var mv = P.speed * dt;
		P.dist += mv / 4;
		P.gOff += mv;
		P.anim += dt * P.speed / 26;
		if (P.dist >= P.mile){ banner(P.mile + " m", C.green, 1.2); SFX.level(); P.mile += 250; }

		/* physics */
		var g = 160 * (K.d && !P.ground ? 2.6 : 1) * (P.hold && P.vy < 0 ? 0.75 : 1);
		P.duck = !!K.d || !!P.tduck;
		if (!P.ground){
			P.vy += g * dt;
			P.y += P.vy * dt;
			if (P.vy >= 0 && P.y >= gY() && P.y - P.vy * dt <= gY() + 0.5 && !overPit()){ P.y = gY(); P.vy = 0; P.ground = true; SFX.land(); }
		}
		else if (overPit()){ P.ground = false; P.vy = 0; }
		if (P.y > FH + 2 && !P.dead){ die(); }

		/* world */
		[P.obs, P.pits, P.bits].forEach(function(a){ a.forEach(function(o){ o.x -= mv; }); });
		P.obs = P.obs.filter(function(o){ return o.x + o.w > -2; });
		P.pits = P.pits.filter(function(o){ return o.x + o.w > -2; });
		P.bits = P.bits.filter(function(o){ return o.x > -2 && !o.got; });
		P.sky.forEach(function(b){ b.x -= mv * 0.15; if (b.x + b.w < 0){ var last = P.sky.reduce(function(m, s){ return Math.max(m, s.x + s.w); }, 0); b.x = last + irnd(0, 3); b.h = irnd(2, 7); } });
		if (!P.dead && (P.nextT -= dt) <= 0) spawn();

		if (!P.dead){
			var hb = hitbox();
			P.obs.forEach(function(o){
				var ob = { x: o.x + 0.3, y: o.y + 0.3, w: o.w - 0.6, h: o.h - 0.6 };
				if (hb.x < ob.x + ob.w && hb.x + hb.w > ob.x && hb.y < ob.y + ob.h && hb.y + hb.h > ob.y) die();
				if (!o.passed && o.x + o.w < PX){ o.passed = true; if (!P.ground) { P.coins++; pop(PX + 1.5, P.y - 4 * RH, "nice", C.dim); } }
			});
			P.bits.forEach(function(b){
				var by = b.y + Math.sin(P.t * 4 + b.ph) * 0.6;
				if (b.x + 2 > hb.x && b.x < hb.x + hb.w && by + RH > hb.y && by < hb.y + hb.h){
					b.got = true; P.coins++;
					burst(b.x + 1, by + RH / 2, C.yellow, 6, 10, ["0", "1"]);
					SFX.coin();
				}
			});
		}
	}
	function draw(){
		var gy = gY();
		/* skyline */
		P.sky.forEach(function(b){
			for (var r = 0; r < b.h; r++){
				var y = gy - (r + 1) * RH * 0.9 - RH * 0.4;
				var row = r === b.h - 1 ? "." + rep("_", b.w - 2) + "." : "|" + rep((r + Math.floor(b.x / 7)) % 3 ? ":" : " ", b.w - 2) + "|";
				txt(row, b.x, y, C.faint);
			}
		});
		txt("( )", COLS - 9, 2.5 * RH, C.mid);

		/* ground */
		var pat = "=-=-~=-==-=~-=", sub = ".  :   .    ' . ", g = "", s = "", off = Math.floor(P.gOff);
		for (var i = 0; i < COLS; i++){
			var inPit = P.pits.some(function(p){ return i >= p.x && i < p.x + p.w; });
			g += inPit ? " " : pat[(i + off) % pat.length];
			s += inPit ? " " : sub[(i + off) % sub.length];
		}
		txt(g, 0, gy, C.mid);
		txt(s, 0, gy + RH, C.faint);
		txt(s.split("").reverse().join(""), 0, gy + 2 * RH, C.faint);

		P.bits.forEach(function(b){ glow(C.yellow, 8); txt(Math.floor(P.t * 3 + b.ph) % 2 ? "01" : "10", b.x, b.y + Math.sin(P.t * 4 + b.ph) * 0.6, C.yellow); });
		noGlow();
		P.obs.forEach(function(o){
			glow(o.O.col, 8);
			var rows = o.type === "drone" ? [Math.floor(P.t * 12) % 2 ? "<=o=>" : "<-o->"] : o.O.spr;
			spr(rows, o.x, o.y, o.O.col);
		});
		noGlow();

		/* runner */
		var f = P.dead ? DEAD : !P.ground ? (P.vy < 0 ? JUMP : FALL) : P.duck ? DUCK : RUN[Math.floor(P.anim * 6) % 4];
		glow(C.green, 10);
		spr(f, PX, P.y - f.length * RH, P.dead ? C.red : C.hi);
		noGlow();
		if (P.ground && !P.dead && Math.floor(P.anim * 6) % 2) txt("'", PX - 1, P.y - RH * 0.6, C.dim, 0.6);
		drawFx();

		txt(pad(Math.floor(P.dist), 6) + " m", 1, 0.6, C.fg);
		txt("bits " + pad(P.coins, 3), 1, 0.6 + RH, C.yellow);
		txt("HI " + pad(Math.max(hiOf(RUNNER), score()), 6), COLS - 11, 0.6, C.dim);
		txt("score " + pad(score(), 6), COLS - 14, 0.6 + RH, C.fg);
		txt(rep("▮", Math.round((P.speed - 26) / 46 * 10)) + rep("▯", 10 - Math.round((P.speed - 26) / 46 * 10)), COLS / 2 - 5, 0.6, C.green, 0.6);
	}
	var ty = 0;
	function ptr(type, x, y){
		if (type === "down"){ ty = y; jump(); }
		else if (type === "move" && ty && y - ty > 3) P.tduck = true;
		else if (type === "up"){ release(); P.tduck = false; ty = 0; }
	}
	var JK = { Space: 1, ArrowUp: 1, KeyW: 1 };
	return {
		id: "runner", name: "RUNNER", tag: "jump the stack, mind the gaps", cols: 64, aspect: 0.62,
		controls: [["jump", "space · up · z/w · tap (hold = higher)"], ["duck", "down · s · swipe down"], ["bits", "grab 01 for +25, airtime over obstacles too"]],
		start: start, update: update, draw: draw, ptr: ptr,
		key: function(e, down){
			if (JK[e.code]){ e.preventDefault(); if (down && !e.repeat) jump(); else if (!down) release(); return true; }
			return false;
		},
		resize: function(){ if (P.ground) P.y = gY(); },
		overLines: function(){ return [Math.floor(P.dist) + " m   ·   " + P.coins + " bits"]; }
	};
})();

/* ================= IDLE.EXE: incremental game, progress saved in the browser ================= */
var IDLE = (function(){
	var GENS = [
		{ n: "intern",       d: "copies from stack overflow", base: 15,    rate: 0.1 },
		{ n: "bash script",  d: "automates the boring part",  base: 100,   rate: 1 },
		{ n: "ci bot",       d: "pushes on every save",       base: 1100,  rate: 8 },
		{ n: "vps",          d: "runs 24/7 in paris",         base: 12000, rate: 47 },
		{ n: "k8s cluster",  d: "yaml all the way down",      base: 1.3e5, rate: 260 },
		{ n: "datacenter",   d: "has its own power plant",    base: 1.4e6, rate: 1400 },
		{ n: "ai model",     d: "writes bugs faster than you", base: 2e7,  rate: 7800 },
		{ n: "quantum core", d: "compiles before you type",   base: 3.3e8, rate: 44000 }
	];
	var UPS = [
		{ n: "mechanical keyboard", c: 100,   click: 2, d: "x2 per click" },
		{ n: "ajazz ak820",         c: 1500,  click: 3, d: "x3 per click" },
		{ n: "energy drink",        c: 2e4,   gen: 1.5, d: "x1.5 everything" },
		{ n: "second monitor",      c: 2e5,   click: 5, d: "x5 per click" },
		{ n: "dark theme",          c: 2e6,   gen: 2,   d: "x2 everything" },
		{ n: "vim motions",         c: 3e7,   click: 10, d: "x10 per click" },
		{ n: "10x engineer",        c: 5e8,   gen: 3,   d: "x3 everything" },
		{ n: "rewrite in rust",     c: 1e10,  gen: 5,   d: "x5 everything" },
		{ n: "ship on friday",      c: 5e11,  gen: 8,   d: "x8 everything, no regrets" }
	];
	var FILES = ["main.rs", "index.html", "worker.js", "eye.glsl", "api.go", "lanyard.ts", "arcade.js", "kernel.c", "boot.asm", "db.sql", "style.css", "ai.py"];
	var VARS = ["tmp", "foo", "data2", "old_fix", "x", "final_final", "todo", "hack"];
	var S, hits = [], log = [], logT = 0, saveT = 0, pressT = 0, bug = null, bugT = 50, away = null, frenzy = 0;

	function fresh(){ return { loc: 0, run: 0, all: 0, gens: GENS.map(function(){ return 0; }), up: 0, stars: 0, ver: 1, clicks: 0, t: Date.now() }; }
	function restore(){
		try { S = JSON.parse(load("ayka-idle", "") || "null"); } catch (e){ S = null; }
		if (!S || !S.gens){ S = fresh(); return; }
		var fx = fresh();
		for (var k in fx) if (S[k] == null) S[k] = fx[k];
		var dt = Math.min(8 * 3600, Math.max(0, (Date.now() - (S.t || Date.now())) / 1000));
		var gain = rate() * dt * 0.5;
		if (gain >= 1 && dt > 30){ add(gain); away = { gain: gain, t: 6, dt: dt }; }
	}
	function persist(){ S.t = Date.now(); save("ayka-idle", JSON.stringify(S)); }
	function cost(i){ return Math.ceil(GENS[i].base * Math.pow(1.15, S.gens[i])); }
	function genMult(){ var m = 1 + S.stars * 0.1; for (var i = 0; i < S.up; i++) if (UPS[i].gen) m *= UPS[i].gen; return m * (frenzy > 0 ? 7 : 1); }
	function milestone(n){ return Math.pow(2, (n >= 25) + (n >= 50) + (n >= 100) + (n >= 200) + (n >= 400)); }
	function rateOf(i){ return GENS[i].rate * S.gens[i] * milestone(S.gens[i]) * genMult(); }
	function rate(){ var r = 0; for (var i = 0; i < GENS.length; i++) r += rateOf(i); return r; }
	function clickPow(){ var m = 1; for (var i = 0; i < S.up; i++) if (UPS[i].click) m *= UPS[i].click; return m * (1 + S.stars * 0.1) * (frenzy > 0 ? 7 : 1) + rate() * 0.02; }
	function add(n){ S.loc += n; S.run += n; S.all += n; }
	function starsFor(){ return Math.floor(Math.sqrt(S.all / 1e6)); }
	function pendingStars(){ return Math.max(0, starsFor() - S.stars); }

	function compile(x, y){
		var n = clickPow();
		add(n); S.clicks++;
		pressT = 0.1;
		var px = x == null ? COLS / 2 + rnd(-6, 6) : x, py = y == null ? btnY() + RH * 1.5 : y;
		pop(px, py - 1, "+" + fmt(n), frenzy > 0 ? C.yellow : C.green);
		burst(px, py, C.green, 5, 12, ["{", "}", ";", "(", ")", "<", ">", "=", "0", "1"]);
		SFX.key();
		if (Math.random() < 0.3) pushLog();
	}
	function buy(i, many){
		var k = many ? 10 : 1, bought = 0;
		while (k-- > 0 && S.loc >= cost(i)){ S.loc -= cost(i); S.gens[i]++; bought++; }
		if (bought){
			SFX.coin();
			if ([25, 50, 100, 200, 400].indexOf(S.gens[i]) >= 0 || (bought > 1 && [25, 50, 100, 200, 400].some(function(m){ return S.gens[i] >= m && S.gens[i] - bought < m; }))){
				banner(GENS[i].n + " x2 speed", C.green, 1.6); SFX.level();
			}
		}
		else SFX.err();
	}
	function upgrade(){
		var u = UPS[S.up];
		if (!u || S.loc < u.c){ SFX.err(); return; }
		S.loc -= u.c; S.up++;
		banner(u.n, C.purple, 1.6); SFX.power(); flash(0.25);
	}
	function ship(){
		var p = pendingStars();
		if (!p){ SFX.err(); return; }
		S.stars += p; S.ver++;
		S.loc = 0; S.run = 0; S.up = 0; S.gens = GENS.map(function(){ return 0; });
		banner("shipped v" + S.ver + ".0  +" + p + " ★", C.yellow, 2.4);
		SFX.unlock(); flash(0.8); shake(6);
		log = []; persist();
	}
	function pushLog(){
		var r = Math.random(), line;
		if (r < 0.5) line = ["[ok]", "compiled " + pick(FILES) + " (" + irnd(2, 900) + "ms)", C.green];
		else if (r < 0.7) line = ["[warn]", "unused variable '" + pick(VARS) + "'", C.yellow];
		else if (r < 0.85) line = ["[ok]", irnd(3, 400) + " tests passed", C.green];
		else if (r < 0.95) line = ["[git]", "push origin main", C.blue];
		else line = ["[err]", "segfault (core dumped) ... retrying", C.red];
		log.push(line);
		if (log.length > 5) log.shift();
	}

	function btnY(){ return 6.2 * RH; }
	function start(){
		restore();
		log = []; bug = null; bugT = rnd(30, 70); frenzy = 0; saveT = 0;
		for (var i = 0; i < 3; i++) pushLog();
	}
	function update(dt){
		add(rate() * dt);
		frenzy = Math.max(0, frenzy - dt);
		pressT = Math.max(0, pressT - dt);
		if (away && (away.t -= dt) <= 0) away = null;
		var r = rate();
		if (r > 0 && (logT -= dt) <= 0){ pushLog(); logT = clamp(4 / Math.log10(r + 10), 0.25, 3); }
		if ((saveT += dt) > 5){ saveT = 0; persist(); }
		if (!bug && (bugT -= dt) <= 0){ bug = { x: -4, y: rnd(3, 11) * RH, dir: 1, t: 0 }; if (Math.random() < 0.5){ bug.x = COLS + 2; bug.dir = -1; } SFX.blip(); }
		if (bug){
			bug.t += dt; bug.x += bug.dir * 7 * dt;
			if (bug.x < -6 || bug.x > COLS + 6){ bug = null; bugT = rnd(40, 90); }
		}
	}
	function catchBug(){
		var b = bug; bug = null; bugT = rnd(40, 90);
		burst(b.x + 1.5, b.y + Math.sin(b.t * 5) * 1.5 + RH / 2, C.yellow, 30, 22, ["$", "*", "+"]);
		shake(4); SFX.power();
		if (Math.random() < 0.5){ frenzy = 20; banner("FRENZY x7 for 20s", C.yellow, 1.8); }
		else { var g = Math.max(clickPow() * 50, rate() * 600); add(g); banner("bug bounty +" + fmt(g), C.yellow, 1.8); }
	}

	function row(y, x, w, fn){ hits.push({ x: x, y: y, w: w, h: RH * 1.05, fn: fn }); }
	function draw(){
		hits = [];
		var r = rate();
		txt("IDLE.EXE", 1, 0.5, C.purple);
		txt("v" + S.ver + ".0", 10, 0.5, C.dim);
		var st = "★ " + S.stars + "  (+" + S.stars * 10 + "%)";
		txt(st, COLS - st.length - 1, 0.5, C.yellow);

		glow(frenzy > 0 ? C.yellow : C.green, 14);
		center(fmt(S.loc) + " lines", 2 * RH, frenzy > 0 ? C.yellow : C.hi, 2, true);
		noGlow();
		center(fmt(r) + " / sec   ·   " + fmt(clickPow()) + " / click" + (frenzy > 0 ? "   ·   FRENZY " + Math.ceil(frenzy) + "s" : ""), 4.3 * RH, frenzy > 0 ? C.yellow : C.dim);

		/* the big button */
		var by = btnY() + (pressT > 0 ? 0.4 : 0), bw = 26, bx = COLS / 2 - bw / 2;
		var bc = pressT > 0 ? C.hi : C.green;
		glow(C.green, pressT > 0 ? 18 : 8);
		box(bx, by, bw, 4, bc);
		center("[  C O M P I L E  ]", by + RH * 1.5, bc, 1, true);
		noGlow();
		hits.push({ x: bx, y: btnY(), w: bw, h: RH * 4, fn: function(x, y){ compile(x, y); } });

		/* build log */
		var ly = btnY() + RH * 4.6;
		log.forEach(function(l, i){
			var a = 0.35 + 0.65 * (i + 1) / log.length;
			txt(l[0], 3, ly + i * RH, l[2], a);
			txt(l[1], 3 + l[0].length + 1, ly + i * RH, C.dim, a);
		});

		/* generators */
		var gy = ly + RH * 5.6;
		txt(rep("─", COLS - 2), 1, gy - RH * 0.8, C.line);
		GENS.forEach(function(g, i){
			var y = gy + i * RH * 1.15, c = cost(i), can = S.loc >= c;
			var known = i === 0 || S.gens[i - 1] > 0 || S.gens[i] > 0 || S.all >= g.base * 0.5;
			if (!known){ txt("[" + (i + 1) + "] ???", 2, y, C.faint); return; }
			txt("[" + (i + 1) + "]", 2, y, can ? C.green : C.mid);
			txt(g.n, 6, y, can ? C.hi : C.dim);
			txt("x" + S.gens[i], 20, y, C.fg);
			txt(fmt(c), 27, y, can ? C.yellow : C.mid);
			txt(S.gens[i] ? "+" + fmt(rateOf(i)) + "/s" : g.d, 36, y, C.dim, S.gens[i] ? 1 : 0.6);
			row(y, 1, COLS - 2, function(){ buy(i, false); });
		});

		var uy = gy + GENS.length * RH * 1.15 + RH * 0.5, u = UPS[S.up];
		txt(rep("─", COLS - 2), 1, uy - RH * 0.6, C.line);
		if (u){
			var cu = S.loc >= u.c;
			txt("[u]", 2, uy, cu ? C.purple : C.mid);
			txt(u.n, 6, uy, cu ? C.hi : C.dim);
			txt(fmt(u.c), 27, uy, cu ? C.yellow : C.mid);
			txt(u.d, 36, uy, C.dim);
			row(uy, 1, COLS - 2, upgrade);
		}
		else txt("all upgrades bought", 6, uy, C.dim);
		var p = pendingStars();
		var sy = uy + RH * 1.2;
		if (S.all >= 1e6){
			txt("[v]", 2, sy, p ? C.yellow : C.mid);
			txt(p ? "ship v" + (S.ver + 1) + ".0: reset for +" + p + " ★ (+" + p * 10 + "% forever)" : "next ★ at " + fmt(Math.pow(S.stars + 1, 2) * 1e6) + " lines total", 6, sy, p ? C.yellow : C.dim);
			if (p) row(sy, 1, COLS - 2, ship);
		}
		else txt("ship a new version at 1M lines total to earn ★", 6, sy, C.faint);

		txt("space compile · 1-8 buy (shift: x10) · u upgrade · v ship", 1, FH - RH * 1.1, C.mid);

		/* golden bug */
		if (bug){
			var yy = bug.y + Math.sin(bug.t * 5) * 1.5;
			glow(C.yellow, 16);
			txt(Math.floor(bug.t * 8) % 2 ? "{$}" : "}$}", bug.x, yy, C.yellow);
			noGlow();
			hits.unshift({ x: bug.x - 1.5, y: yy - RH * 0.8, w: 6, h: RH * 2.6, fn: catchBug });
		}
		drawFx();
		if (away){
			var a = Math.min(1, away.t);
			rectU(6, FH * 0.42, COLS - 12, RH * 3, C.bg, 0.92 * a);
			center("while you were away (" + Math.round(away.dt / 60) + " min)", FH * 0.42 + RH * 0.5, C.dim, 1, false, a);
			center("+" + fmt(away.gain) + " lines", FH * 0.42 + RH * 1.6, C.green, 1, true, a);
		}
	}
	function ptr(type, x, y){
		if (type !== "down") return;
		for (var i = 0; i < hits.length; i++){
			var h = hits[i];
			if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h){ h.fn(x, y); return; }
		}
	}
	function key(e, down){
		if (!down) return false;
		var k = (e.key || "").toLowerCase(), d = /^Digit([1-8])$/.exec(e.code);
		if (e.code === "Space" || k === "enter"){ e.preventDefault(); if (!e.repeat || S.clicks % 3 === 0) compile(); return true; }
		if (d){ buy(+d[1] - 1, e.shiftKey); return true; }
		if (k === "u"){ upgrade(); return true; }
		if (k === "v"){ ship(); return true; }
		return false;
	}
	return {
		id: "idle", name: "IDLE.EXE", tag: "compile forever, it keeps going while you're away", cols: 60, rows: 36, noTitle: true, noPause: true, noScore: true,
		start: start, update: update, draw: draw, ptr: ptr, key: key,
		leave: function(){ if (S) persist(); },
		menuInfo: function(){
			var s; try { s = JSON.parse(load("ayka-idle", "") || "null"); } catch (e){}
			return s && s.all ? "★" + (s.stars || 0) + " · " + fmt(s.all) : "new";
		}
	};
})();

/* ================= arcade shell: menu, title, pause, game over, input, loop ================= */
var MENU = { cols: 56, aspect: 1.3 };
var GAMES = [BUGHUNT, SERPENT, BREAKER, TYPERUSH, RUNNER, IDLE];
var mode = "off", cur = null, sel = clamp(+load("ayka-arc-sel", "0") || 0, 0, GAMES.length - 1), T = 0, mT = 0, K = {}, BN = null;
var raf = 0, last = 0, isOpen = false, newHi = false, lastScore = 0, drag = null, hitsUI = [], typedN = -1;

function hiOf(g){ return +load(g.hiKey || "ayka-arc-hi-" + g.id, "0") || 0; }
function setHi(g, v){ save(g.hiKey || "ayka-arc-hi-" + g.id, String(Math.floor(v))); }
function banner(text, col, dur){ BN = { text: text, col: col, t: 0, max: dur || 1.8 }; }
function gameOver(score){
	if (mode !== "play") return;
	mode = "over"; mT = 0; lastScore = Math.floor(score); newHi = false;
	if (lastScore > hiOf(cur)){ setHi(cur, lastScore); newHi = lastScore > 0; }
	blurText();
	SFX.over();
}

/* hidden input so phones open their keyboard for TYPE RUSH */
var ti = document.createElement("input");
ti.type = "text";
["autocomplete", "autocorrect", "autocapitalize"].forEach(function(a){ ti.setAttribute(a, "off"); });
ti.spellcheck = false;
ti.setAttribute("aria-label", "type here");
ti.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;background:transparent;color:transparent";
root.appendChild(ti);
ti.addEventListener("input", function(){
	var v = ti.value; ti.value = "";
	if (mode === "play" && cur && cur.text) for (var i = 0; i < v.length; i++) cur.text(v[i]);
});
function focusText(){ try { ti.focus({ preventScroll: true }); } catch (e){ ti.focus(); } }
function blurText(){ if (document.activeElement === ti) ti.blur(); }

function toMenu(){
	if (cur && cur.leave) cur.leave();
	var from = mode;
	cur = null; mode = "menu"; mT = 0; BN = null; K = {};
	clearFx(); layout(MENU); blurText();
	startMusic();
	if (from !== "unlock") SFX.back();
}
function toTitle(g){
	cur = g; save("ayka-arc-sel", String(GAMES.indexOf(g)));
	layout(g); clearFx(); BN = null;
	if (g.noTitle){ play(); return; }
	mode = "title"; mT = 0;
	SFX.select();
}
function play(){
	audio(); clearFx(); BN = null; K = {};
	mode = "play"; mT = 0; last = 0;
	cur.start();
	if (cur.wantsText) focusText();
	SFX.select();
}
function pause(on){
	if (on && mode === "play" && !cur.noPause){ mode = "paused"; K = {}; blurText(); }
	else if (!on && mode === "paused"){ mode = "play"; last = 0; if (cur.wantsText) focusText(); }
}

/* ---------- drawing of the shell screens ---------- */
var UNLOCK = ["> ↑ ↑ ↓ ↓ ← → ← →", "> sequence accepted", "> mounting /dev/arcade ...", "> " + GAMES.length + " programs found", "> ACCESS GRANTED"];
var UNLOCK_ALL = UNLOCK.join(""), UNLOCK_LEN = UNLOCK_ALL.length;
function drawUnlock(){
	var n = Math.floor(mT / 0.022), used = 0;
	UNLOCK.forEach(function(line, i){
		var show = Math.max(0, Math.min(line.length, n - used));
		used += line.length;
		if (!show) return;
		var lastL = i === UNLOCK.length - 1;
		if (lastL && show === line.length) glow(C.green, 14);
		txt(line.slice(0, show) + (show < line.length || (lastL && Math.floor(T * 3) % 2) ? "_" : ""), 4, FH * 0.36 + i * RH * 1.3,
			lastL ? C.green : i === 0 ? C.purple : C.fg);
		noGlow();
	});
}
function drawMenu(){
	hitsUI = [];
	var y0 = FH * 0.05, look = clamp((sel - (GAMES.length - 1) / 2) / 3, -1, 1);
	glow(C.purple, 12);
	drawEye(COLS / 2 - 6.5, y0, C.purple, Math.sin(T * 0.7) * 0.4 + look * 0.6, Math.sin(T * 2.1) > 0.99);
	noGlow();
	glitchTitle("AYKA ARCADE", y0 + 6 * RH, 2.5, gradient());
	center("free play · " + GAMES.length + " programs", y0 + 9.2 * RH, C.dim);

	var ly = y0 + 11.5 * RH;
	GAMES.forEach(function(g, i){
		var y = ly + i * RH * 1.8, on = i === sel;
		if (on){ rectU(3, y - RH * 0.35, COLS - 6, RH * 1.6, C.purple, 0.08); glow(C.purple, 10); }
		txt(on ? ">" : " ", 4, y, C.green);
		txt((i + 1) + ". " + g.name, 6, y, on ? C.hi : C.fg);
		noGlow();
		var info = g.menuInfo ? g.menuInfo() : "hi " + pad(hiOf(g), 7);
		txt(info, COLS - 4 - info.length, y, on ? C.yellow : C.dim);
		hitsUI.push({ x: 3, y: y - RH * 0.4, w: COLS - 6, h: RH * 1.7, fn: (function(k){ return function(){ sel = k; toTitle(GAMES[k]); }; })(i), hover: i });
	});
	var dy = ly + GAMES.length * RH * 1.8 + RH * 0.6;
	center(GAMES[sel].tag, dy, C.fg);
	var fy = FH - RH * 2.2;
	center("↑↓ choose · enter play · esc quit", fy, C.mid);
	var ms = "[ sound: " + (muted ? "off" : "on") + " (m) ]";
	center(ms, fy + RH * 1.1, muted ? C.dim : C.green);
	hitsUI.push({ x: COLS / 2 - ms.length / 2, y: fy + RH, w: ms.length, h: RH * 1.2, fn: toggleMute });
}
function drawTitle(){
	var y = FH * 0.14;
	glitchTitle(cur.name, y, 3, gradient());
	center(cur.tag, y + 4 * RH, C.fg);
	var cy = y + 6.5 * RH;
	(cur.controls || []).forEach(function(r, i){ txt(r[0], 3, cy + i * RH * 1.25, C.dim); txt(r[1], 11, cy + i * RH * 1.25, C.fg); });
	cy += (cur.controls || []).length * RH * 1.25 + RH;
	if (cur.legend){
		var w = cur.legend.reduce(function(s, l){ return s + l[0].length + 3; }, -3), x = COLS / 2 - w / 2;
		cur.legend.forEach(function(l){ txt(l[0], x, cy, l[1]); x += l[0].length + 3; });
		cy += RH * 1.8;
	}
	if (Math.floor(T * 2) % 2) center("[ press space or tap to start ]", cy + RH, C.hi);
	center("hi " + pad(hiOf(cur), 7), cy + RH * 2.8, C.dim);
	center("esc: back to menu · p: pause · m: sound", FH - RH * 1.6, C.mid);
}
function drawBanner(){
	if (!BN) return;
	var a = Math.min(1, BN.t * 4, (BN.max - BN.t) * 3);
	if (BN.col === C.red && Math.floor(T * 6) % 2 === 0) return;
	glow(BN.col, 16);
	center(BN.text, FH * 0.4, BN.col, 1.7, true, a);
	noGlow();
}
function dimField(a){ ctx.globalAlpha = a; ctx.fillStyle = C.bg; ctx.fillRect(ox, oy, COLS * cw, FH * cw); ctx.globalAlpha = 1; }
function drawPaused(){
	dimField(0.6);
	glitchTitle("PAUSED", FH * 0.38, 2.4, C.hi);
	center("space / tap: resume   ·   esc: menu", FH * 0.38 + 3.4 * RH, C.dim);
}
function drawOver(){
	hitsUI = [];
	if (mT < 0.5) return;
	var k = Math.min(1, (mT - 0.5) * 3), y = FH * 0.28;
	dimField(0.6 * k);
	glitchTitle("GAME OVER", y, 3, C.red, k);
	center("score " + pad(lastScore, 7), y + 4.2 * RH, C.hi, 1.2, true, k);
	(cur.overLines ? cur.overLines() : []).forEach(function(l, i){ center(l, y + (5.8 + i * 1.2) * RH, C.fg, 1, false, k); });
	if (newHi && Math.floor(T * 3) % 2) center("★ new high score ★", y + 7.6 * RH, C.yellow, 1, true, k);
	else if (!newHi) center("hi " + pad(hiOf(cur), 7), y + 7.6 * RH, C.dim, 1, false, k);
	if (mT > 1){
		var by = y + 10 * RH, a = "[ space: retry ]", b = "[ esc: menu ]";
		txt(a, COLS / 2 - a.length - 2, by, C.hi);
		txt(b, COLS / 2 + 2, by, C.dim);
		hitsUI.push({ x: COLS / 2 - a.length - 2, y: by - RH * 0.4, w: a.length, h: RH * 1.8, fn: play });
		hitsUI.push({ x: COLS / 2 + 2, y: by - RH * 0.4, w: b.length, h: RH * 1.8, fn: toMenu });
	}
}

function draw(){
	ctx.globalAlpha = 1;
	ctx.fillStyle = C.bg;
	ctx.fillRect(0, 0, W, H);
	setFont(1);
	ctx.textBaseline = "top";
	ctx.save();
	if (FX.shake) ctx.translate(rnd(-1, 1) * FX.shake, rnd(-1, 1) * FX.shake);
	ctx.strokeStyle = C.line; ctx.lineWidth = 1;
	ctx.strokeRect(ox - 6.5, oy - 0.5, COLS * cw + 13, FH * cw + 1);
	ctx.save();
	ctx.beginPath(); ctx.rect(ox - 6, oy, COLS * cw + 12, FH * cw); ctx.clip();
	if (mode === "unlock"){ drawStars(); drawUnlock(); }
	else if (mode === "menu"){ drawStars(); drawMenu(); }
	else if (mode === "title"){ if (cur.title) cur.title(); drawTitle(); }
	else if (cur){
		cur.draw();
		drawBanner();
		if (mode === "paused") drawPaused();
		else if (mode === "over") drawOver();
	}
	ctx.restore();
	ctx.restore();
	ctx.globalAlpha = 1;
	ctx.fillStyle = scanPat; ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = vign; ctx.fillRect(0, 0, W, H);
	if (FX.flash){ ctx.globalAlpha = FX.flash * 0.5; ctx.fillStyle = C.hi; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}

function frame(ts){
	raf = requestAnimationFrame(frame);
	var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
	last = ts;
	T += dt; mT += dt;
	if (mode !== "paused"){
		updateFx(dt);
		if (BN && (BN.t += dt) > BN.max) BN = null;
	}
	if (mode === "unlock"){
		var n = Math.floor(mT / 0.022);
		if (n !== typedN){ typedN = n; if (n < UNLOCK_LEN && UNLOCK_ALL[n] !== " ") SFX.type(); }
		updateStars(dt);
		if (mT > UNLOCK_LEN * 0.022 + 1.1) toMenu();
	}
	else if (mode === "menu" || mode === "title") updateStars(dt, 0.5);
	else if (mode === "play") cur.update(dt);
	draw();
}

/* ---------- input ---------- */
var KEYMAP = { ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r", ArrowUp: "u", KeyW: "u", ArrowDown: "d", KeyS: "d" };
function confirmKey(e){ var k = (e.key || "").toLowerCase(); return e.code === "Space" || k === "enter"; }
function onKey(e, down){
	e.stopImmediatePropagation();
	if (e.ctrlKey || e.metaKey || e.altKey) return;
	var key = (e.key || "").toLowerCase(), code = e.code;
	if (down && key === "escape"){
		e.preventDefault();
		if (mode === "play"){ if (cur.noPause) toMenu(); else pause(true); }
		else if (mode === "menu") closeArcade();
		else toMenu();
		return;
	}
	if (mode === "play"){
		if (cur.wantsText){
			if (cur.key && cur.key(e, down)) return;
			if (down && key.length === 1 && document.activeElement !== ti){ e.preventDefault(); cur.text(e.key); }
			return;
		}
		if (cur.key && cur.key(e, down)) return;
		var k = KEYMAP[code];
		if (k){ e.preventDefault(); K[k] = down; return; }
		if (!down) return;
		if (key === "p" && !cur.noPause){ e.preventDefault(); pause(true); }
		else if (key === "m"){ e.preventDefault(); toggleMute(); }
		else if (code === "Space") e.preventDefault();
		return;
	}
	if (KEYMAP[code]) K[KEYMAP[code]] = false;
	if (!down) return;
	if (KEYMAP[code] || code === "Space" || key === "enter") e.preventDefault();
	if (key === "m"){ toggleMute(); return; }
	if (mode === "menu"){
		var d = /^Digit([1-9])$/.exec(code);
		if (code === "ArrowUp" || code === "KeyW"){ sel = (sel + GAMES.length - 1) % GAMES.length; SFX.move(); }
		else if (code === "ArrowDown" || code === "KeyS"){ sel = (sel + 1) % GAMES.length; SFX.move(); }
		else if (confirmKey(e) && !e.repeat) toTitle(GAMES[sel]);
		else if (d && +d[1] <= GAMES.length){ sel = +d[1] - 1; toTitle(GAMES[sel]); }
	}
	else if (mode === "unlock"){ if (confirmKey(e)) toMenu(); }
	else if (mode === "title"){ if (confirmKey(e) && !e.repeat) play(); }
	else if (mode === "over"){ if (confirmKey(e) && mT > 1 && !e.repeat) play(); }
	else if (mode === "paused"){ if (confirmKey(e) || key === "p") pause(false); }
}
addEventListener("keydown", function(e){ if (isOpen) onKey(e, true); }, true);
addEventListener("keyup", function(e){ if (isOpen) onKey(e, false); }, true);

var xBtn = document.getElementById("game-x");
xBtn.addEventListener("click", function(e){ e.stopPropagation(); closeArcade(); });
function wpos(e){ return { x: (e.clientX - ox) / cw, y: (e.clientY - oy) / cw }; }
function hitUI(p){
	for (var i = 0; i < hitsUI.length; i++){
		var h = hitsUI[i];
		if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return h;
	}
	return null;
}
root.addEventListener("pointerdown", function(e){
	if (e.target === xBtn) return;
	e.preventDefault();
	audio();
	var p = wpos(e), touch = e.pointerType !== "mouse";
	drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
	try { root.setPointerCapture(e.pointerId); } catch (err){}
	if (mode === "menu"){ var h = hitUI(p); if (h) h.fn(); }
	else if (mode === "unlock") toMenu();
	else if (mode === "title") play();
	else if (mode === "over"){ var o = hitUI(p); if (o) o.fn(); else if (mT > 1) play(); }
	else if (mode === "paused") pause(false);
	else if (mode === "play"){
		if (cur.wantsText) focusText();
		if (cur.ptr) cur.ptr("down", p.x, p.y, 0, 0, { down: true, touch: touch });
	}
});
root.addEventListener("click", function(){ if (mode === "play" && cur && cur.wantsText) focusText(); });
root.addEventListener("pointermove", function(e){
	var p = wpos(e), touch = e.pointerType !== "mouse", dx = 0, dy = 0;
	if (drag && drag.id === e.pointerId){ dx = (e.clientX - drag.x) / cw; dy = (e.clientY - drag.y) / cw; drag.x = e.clientX; drag.y = e.clientY; }
	if (mode === "play" && cur.ptr) cur.ptr("move", p.x, p.y, dx, dy, { down: !!drag, touch: touch });
	else if (mode === "menu" && !touch){ var h = hitUI(p); if (h && h.hover != null && h.hover !== sel){ sel = h.hover; SFX.move(); } }
	root.style.cursor = (mode === "menu" || mode === "over") && hitUI(p) ? "pointer" : "";
});
function endDrag(e){
	if (mode === "play" && cur && cur.ptr){ var p = wpos(e); cur.ptr("up", p.x, p.y, 0, 0, { down: false, touch: e.pointerType !== "mouse" }); }
	drag = null;
}
root.addEventListener("pointerup", endDrag);
root.addEventListener("pointercancel", endDrag);
["wheel", "touchstart", "touchmove", "touchend"].forEach(function(t){
	root.addEventListener(t, function(e){ e.stopPropagation(); if (t !== "touchstart" && e.cancelable && e.target !== ti) e.preventDefault(); }, { passive: false });
});
addEventListener("resize", function(){ if (isOpen) layout(cur || MENU); });
addEventListener("blur", function(){ K = {}; if (isOpen) pause(true); });
document.addEventListener("visibilitychange", function(){
	if (!isOpen || !document.hidden) return;
	pause(true);
	if (cur && cur.leave) cur.leave();
});
addEventListener("pagehide", function(){ if (cur && cur.leave) cur.leave(); });

function openArcade(){
	if (isOpen) return;
	isOpen = true;
	root.hidden = false;
	document.documentElement.style.overflow = "hidden";
	dispatchEvent(new CustomEvent("ayka-game", { detail: true }));
	audio();
	cur = null;
	layout(MENU);
	mode = "unlock"; mT = 0; typedN = -1;
	FX.warp = 2.5; clearFx(); flash(0.6);
	SFX.unlock();
	K = {}; last = 0;
	cancelAnimationFrame(raf);
	raf = requestAnimationFrame(frame);
}
function closeArcade(){
	if (!isOpen) return;
	if (cur && cur.leave) cur.leave();
	cur = null;
	isOpen = false;
	root.hidden = true;
	document.documentElement.style.overflow = "";
	stopMusic();
	cancelAnimationFrame(raf); raf = 0;
	K = {}; drag = null; mode = "off";
	blurText();
	dispatchEvent(new CustomEvent("ayka-game", { detail: false }));
}
window.AykaArcade = { open: openArcade, close: closeArcade };
})();

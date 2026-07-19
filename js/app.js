/* Read-only viewer for legacy PrivateBin v1 (SJCL) pastes.
 * Everything runs client-side: the decryption key lives only in the URL
 * fragment (#...) and never reaches the server. */
(function () {
	'use strict';

	var statusEl = document.getElementById('status');
	var pasteEl = document.getElementById('paste');
	var toggleBtn = document.getElementById('toggle');
	var copyBtn = document.getElementById('copy');
	var renderedEl = document.getElementById('pasteout');
	var sourceEl = document.getElementById('pasteraw');

	function fail(msg) {
		statusEl.textContent = msg;
		statusEl.classList.add('error');
	}

	function escapeHtml(s) {
		return s.replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}

	// escaped text -> clickable http/https/magnet links
	function linkify(escaped) {
		return escaped.replace(/((?:https?:\/\/|magnet:)[^\s<]+)/g, function (url) {
			return '<a href="' + url + '" rel="noopener noreferrer nofollow">' + url + '</a>';
		});
	}

	// binary string (latin1) -> proper UTF-8 decoded JS string
	function utf8Decode(bin) {
		var bytes = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
		return new TextDecoder('utf-8').decode(bytes);
	}

	function getId() {
		var q = window.location.search.replace(/^\?/, '');
		q = q.split('&')[0];
		return /^[0-9a-f]{16}$/.test(q) ? q : null;
	}

	function getKey() {
		var h = window.location.hash.replace(/^#/, '');
		try { h = decodeURIComponent(h); } catch (e) { /* keep raw */ }
		return h;
	}

	DOMPurify.addHook('afterSanitizeAttributes', function (node) {
		if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
			node.setAttribute('rel', 'noopener noreferrer nofollow');
		}
	});

	function render(text, formatter) {
		sourceEl.textContent = text;

		if (formatter === 'markdown') {
			var conv = new showdown.Converter({
				simplifiedAutoLink: true,
				tables: true,
				strikethrough: true,
				tasklists: true,
				openLinksInNewWindow: true
			});
			renderedEl.className = 'pv-body pv-md';
			renderedEl.innerHTML = DOMPurify.sanitize(conv.makeHtml(text));
			toggleBtn.hidden = false;
		} else if (formatter === 'syntaxhighlighting') {
			renderedEl.className = 'pv-body';
			var pre = document.createElement('pre');
			var code = document.createElement('code');
			code.className = 'hljs';
			var result = window.hljs ? hljs.highlightAuto(text) : null;
			if (result) code.innerHTML = result.value;
			else code.textContent = text;
			pre.appendChild(code);
			renderedEl.appendChild(pre);
			toggleBtn.hidden = false;
		} else {
			renderedEl.className = 'pv-body';
			var p = document.createElement('pre');
			p.className = 'pv-raw';
			p.innerHTML = linkify(escapeHtml(text));
			renderedEl.appendChild(p);
			toggleBtn.hidden = true; // plaintext: rendered == source
		}

		pasteEl.hidden = false;
		statusEl.hidden = true;
	}

	function decode(blob) {
		// blob.d = SJCL ciphertext JSON string; SJCL picks ccm/gcm and PBKDF2
		// params from the blob itself and derives the key from the URL fragment.
		var b64 = sjcl.decrypt(getKey(), blob.d);
		var inflated = RawDeflate.inflate(atob(b64));
		var text = utf8Decode(inflated);

		// some v1 pastes wrap the message as {"paste":"..."}; unwrap if present
		try {
			var obj = JSON.parse(text);
			if (obj && typeof obj.paste === 'string') text = obj.paste;
		} catch (e) { /* raw text */ }

		return text;
	}

	function init() {
		if (!window.location.search) {
			window.location.replace('https://paste.wiidatabase.de');
			return;
		}

		var id = getId();
		if (!id) { fail('Ungültige oder fehlende Paste-ID.'); return; }
		if (!getKey()) { fail('Kein Schlüssel in der URL (#…). Der Link ist unvollständig.'); return; }

		fetch('p/' + id + '.json', { cache: 'force-cache' })
			.then(function (r) {
				if (!r.ok) throw new Error('notfound');
				return r.json();
			})
			.then(function (blob) {
				var text;
				try { text = decode(blob); }
				catch (e) {
					fail('Entschlüsselung fehlgeschlagen – der Schlüssel im Link passt nicht zu diesem Paste.');
					return;
				}
				render(text, blob.f || 'plaintext');
			})
			.catch(function () {
				fail('Dieses Paste existiert nicht im Archiv (oder wurde gelöscht).');
			});
	}

	toggleBtn.addEventListener('click', function () {
		var showSource = sourceEl.hidden;
		sourceEl.hidden = !showSource;
		renderedEl.hidden = showSource;
		toggleBtn.textContent = showSource ? 'Gerendert anzeigen' : 'Rohtext anzeigen';
	});

	copyBtn.addEventListener('click', function () {
		navigator.clipboard.writeText(sourceEl.textContent).then(function () {
			copyBtn.textContent = 'Kopiert!';
			setTimeout(function () { copyBtn.textContent = 'Kopieren'; }, 1500);
		});
	});

	init();
})();

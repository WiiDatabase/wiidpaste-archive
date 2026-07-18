# paste.wiidatabase.de PrivateBin Legacy Archive

A tiny, fully static, read-only viewer for **legacy PrivateBin v1 (SJCL) pastes**
— the ones that stop working after upgrading a PrivateBin instance to 2.0.0+,
because 2.0 dropped the old `base64.js` / `rawinflate.js` decoding path.

*Used on <https://old.paste.wiidatabase.de/>*

It decrypts old pastes in the browser using **SJCL** (which PrivateBin removed in
1.3). This covers all v1 variants:

- AES-**GCM** (`ks:256, ts:128`)
- AES-**CCM** (`ks:128, ts:64`)
- oldest **ZeroBin-Alpha** blobs (only `iv`/`salt`/`ct`, SJCL defaults → CCM)

Pastes in the current v2 (WebCrypto) format keep working on PrivateBin 2.x and are
**not** exported here.

## Zero-knowledge

The decryption key lives only in the URL fragment (`#…`) and never reaches the
server. The exported `p/<id>.json` blobs are still encrypted, so they can be
served from any dumb static host (Caddy `file_server`, Cloudflare Pages, S3, …)
without leaking anything. No PHP, no backend, no build step, no framework.

## 1. Export the old pastes

Point the generator at a PrivateBin **Filesystem backend** `data/` directory:

```bash
node export.js /path/to/privatebin/data
```

This writes:

| Output                     | Purpose                                                     |
| -------------------------- | ---------------------------------------------------------- |
| `p/<id>.json`              | one encrypted blob per v1 paste (`{f,d,t}`)                 |
| `v1-ids.txt`               | list of exported paste ids                                 |
| `paste-v1-redirect.caddy`  | Caddy `map` snippet redirecting those ids to this archive  |

## 2. Deploy the archive

Serve this whole directory as static files under its own host, e.g.
`old.paste.example.com`.

## 3. Redirect old links from the main instance

Old links look like `https://paste.example.com/?<id>#<key>`. The `#<key>` never
hits the server; the browser re-attaches it after a redirect whose `Location`
has no fragment — so a plain 301 preserves the key.

Import the generated snippet into the **main** paste vhost:

```caddy
paste.example.com {
    root * /srv/http/paste.example.com/public_html
    import paste-v1-redirect.caddy   # map {query} -> redir known v1 ids
    ...
}
```

New pastes created on the upgraded 2.x instance get fresh ids that are not in the
map, so they pass through untouched.

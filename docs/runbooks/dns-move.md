# DNS move: album.guide from Gandi LiveDNS to Cloudflare

The site contract's DNS-move row (`standards/site-contract.md` in `wallabout-design/standards`) asks for the full zone to be exported from the old DNS host, imported into Cloudflare and compared before the nameservers change. This is that record. Decision: `docs/decisions/0003-domain.md`.

## Domain

| Setting | Value |
| --- | --- |
| Registrar | Gandi (registration stays there) |
| Created | 2026-09-26 |
| Expires | 2028-09-26 |
| Automatic renewal | **Disabled** |
| Nameservers (before) | Gandi LiveDNS: `ns-195-b.gandi.net`, `ns-68-a.gandi.net`, `ns-50-c.gandi.net` |
| DNSSEC | **Inactive** (no DS record at the registry; `dig DS album.guide` is empty) |
| Pack DNS Security+ | Inactive |
| Linked zone | None |

## LiveDNS zone (Advanced view, verbatim)

```
@ 86400 IN SOA ns1.gandi.net. hostmaster.gandi.net. 1790438139 10800 3600 604800 10800
@ 10800 IN A 217.70.184.38
@ 10800 IN MX 10 spool.mail.gandi.net.
@ 10800 IN MX 50 fb.mail.gandi.net.
@ 10800 IN TXT "v=spf1 include:_mailcust.gandi.net ?all"
_imap._tcp 10800 IN SRV 0 0 0 .
_imaps._tcp 10800 IN SRV 0 1 993 mail.gandi.net.
_pop3._tcp 10800 IN SRV 0 0 0 .
_pop3s._tcp 10800 IN SRV 10 1 995 mail.gandi.net.
_submission._tcp 10800 IN SRV 0 1 465 mail.gandi.net.
gm1._domainkey 10800 IN CNAME gm1.gandimail.net.
gm2._domainkey 10800 IN CNAME gm2.gandimail.net.
gm3._domainkey 10800 IN CNAME gm3.gandimail.net.
webmail 10800 IN CNAME webmail.gandi.net.
www 10800 IN CNAME webredir.vip.gandi.net.
```

## Records and what happens to each

| Name | Type | TTL | Value | Parking? | Copied to Cloudflare? | Why |
| --- | --- | --- | --- | --- | --- | --- |
| @ | SOA | 86400 | ns1.gandi.net. … | n/a | No | Cloudflare writes its own SOA. |
| @ | A | 10800 | 217.70.184.38 | **Yes** | No | Gandi's parking / web-redirect IP (serves the parking page). The Worker custom domain replaces it. |
| www | CNAME | 10800 | webredir.vip.gandi.net. | **Yes** | No | Gandi's web-redirect service, but no web forwarding is configured, so it only serves parking. The Worker redirects `www` to the apex (`docs/decisions/0003-domain.md`). |
| @ | MX | 10800 | 10 spool.mail.gandi.net. | No | Yes | Gandi mail default. |
| @ | MX | 10800 | 50 fb.mail.gandi.net. | No | Yes | Gandi mail default. |
| @ | TXT | 10800 | `v=spf1 include:_mailcust.gandi.net ?all` | No | Yes | SPF for Gandi mail. |
| _imap._tcp | SRV | 10800 | 0 0 0 . | No | Yes | Mail client autodiscovery ("no service"). |
| _imaps._tcp | SRV | 10800 | 0 1 993 mail.gandi.net. | No | Yes | Mail client autodiscovery. |
| _pop3._tcp | SRV | 10800 | 0 0 0 . | No | Yes | Mail client autodiscovery ("no service"). |
| _pop3s._tcp | SRV | 10800 | 10 1 995 mail.gandi.net. | No | Yes | Mail client autodiscovery. |
| _submission._tcp | SRV | 10800 | 0 1 465 mail.gandi.net. | No | Yes | Mail client autodiscovery. |
| gm1._domainkey | CNAME | 10800 | gm1.gandimail.net. | No | Yes (DNS only) | Gandi DKIM. |
| gm2._domainkey | CNAME | 10800 | gm2.gandimail.net. | No | Yes (DNS only) | Gandi DKIM. |
| gm3._domainkey | CNAME | 10800 | gm3.gandimail.net. | No | Yes (DNS only) | Gandi DKIM. |
| webmail | CNAME | 10800 | webmail.gandi.net. | No | Yes (DNS only) | Gandi webmail shortcut. |

All copied records keep TTL 10800 and are DNS only (not proxied).

## Mail

| Setting | Value |
| --- | --- |
| Mailboxes in use | 0 (the account shows 2 unused included mailboxes) |
| Email forwarding addresses | None |
| Mail actually in use | No. The MX/SPF/DKIM/SRV records are Gandi's defaults. |

## Web forwarding

None configured ("You do not have any web forwarding addresses").

## Move to Cloudflare (2026-11-08 / 2026-11-09 04:49 UTC)

- Cloudflare zone `album.guide` created (full setup, Free plan), zone ID `ae543ae67d59a38c5a8a379569dd5f13`, account `23b93bae6a574d711d5ebad0f81c8d5e`. 12 records copied (every row above marked "Yes"), each tagged with the comment "Copied from Gandi LiveDNS 2026-11-08".
- DNSSEC was already inactive at Gandi, so nothing was turned off.
- Gandi nameservers changed from LiveDNS to External: `mary.ns.cloudflare.com`, `mitch.ns.cloudflare.com`, at about 04:49 UTC on 2026-11-09 (2026-11-08 evening US time).
- The LiveDNS zone at Gandi was left as it was (not deleted), so switching back to "Gandi's LiveDNS" restores the old setup.

## After the move

- 2026-11-09 05:00 UTC: the zone went active. 05:12 UTC: the Worker custom domain `album.guide` attached (PR #5); 05:40 UTC: `www.album.guide` attached and redirects to the apex (PR #8).
- The 12 copied records were checked against `mary.ns.cloudflare.com` after the move and answer as before.

## Rollback

In Gandi, set the nameservers back to "Gandi's LiveDNS". The LiveDNS zone above is still there, so the old setup (parking page and mail records) returns once resolvers pick it up. `wrangler rollback` restores an earlier Worker version without touching DNS.

# Public-record sources and the router

Checked on 5 Oct 2026. Each row was verified against a fetched
documentation page or a live request ("probe"). Anything unverified is
marked.

Changes since earlier assumptions:
- The ProPublica Congress API is **shut down**.
- The OpenSecrets API was **discontinued on 15 Apr 2025**. The bulk data
  remains under CC BY-NC-SA.
- OpenCorporates has **no free self-serve tier**: paid plans start at
  £2,250 a year, with free access for journalists and NGOs on application.
- The Open Ownership Register was **retired on 29 Nov 2024**. Its data
  lives on as BODS bulk data.
- OCCRP Aleph **moved to Aleph Pro on 15 Dec 2025**. It is free for
  non-profit journalism.
- Public access to EU beneficial-ownership registers **ended after the
  CJEU's November 2022 ruling**. Access is now by legitimate-interest
  application, and the rules for journalists are due in July 2026.

## Companies, officers and owners

| Source | Access | Limits / terms | Kind |
|---|---|---|---|
| SEC EDGAR submissions and XBRL (US) | none | 10 requests/s, with a contact User-Agent | API + bulk |
| SEC EDGAR full-text search (US, 2001 on) | none | Same limit; not officially documented | JSON |
| State registries via Socrata: NY, CO, CT, OR (probed) | none | Socrata defaults | API |
| Florida Sunbiz | public SFTP | as is | bulk |
| Other US states | — | **Not surveyed** | mostly web |
| UK Companies House (profile, officers, PSC) | free key | 600 requests per 5 minutes | API + bulk |
| OpenOwnership BODS data (UK PSC, GLEIF chains) | none | CC0 | bulk |
| GLEIF LEI (global) | none | open | API + golden copy |
| OpenCorporates (global) | paid, or journalist grant | share-alike + attribution | API |
| EU BRIS | web only | **no API confirmed** | — |

## Political money and activity

| Source | Access | Limits / terms | Kind |
|---|---|---|---|
| OpenFEC (US federal) | free key | DEMO_KEY 40/h; personal key 1,000/h | API + bulk |
| OpenSecrets | bulk only | CC BY-NC-SA | bulk |
| FollowTheMoney.org (US states) | free account key | **Non-commercial.** 1,000 records/year by default; credit required | API |
| lda.gov (formerly Senate LDA) lobbying | none | limits not verified | API |
| Congress.gov API | free key | 5,000/h | API |
| GovTrack v2 | none | licence; small slices only | API + bulk |
| Voteview | none | academic citation | bulk |
| unitedstates/congress-legislators | none | CC0 | bulk |
| UK Electoral Commission | none | **licence not verified** | CSV |
| UK Parliament Register of Interests API | none | **licence not verified** | API |
| EU Transparency Register | none | **format and licence not verified** | bulk |
| Integrity Watch EU | none | — | web only |

## Government money

| Source | Access | Limits / terms | Kind |
|---|---|---|---|
| USAspending v2 | none | — | API + bulk |
| SAM.gov Entity API | free key | **10 requests/day** without a role | API |
| EU TED v3 | none | limits not stated | API |
| UK Contracts Finder | none | — | API (OCDS) |
| UK Find a Tender | none | — | API (OCDS) |

## Sanctions, PEPs, leaks

| Source | Access | Limits / terms | Kind |
|---|---|---|---|
| OpenSanctions | bulk free (non-commercial); API key free for public-interest work | CC BY-NC 4.0; self-host yente | API + bulk |
| ICIJ Offshore Leaks | none | ODbL / CC BY-SA; cite ICIJ | reconciliation API (25 per batch) + dumps |
| OCCRP Aleph Pro | account | free for non-profit journalism | API (auth) |
| Wikidata SPARQL | none | CC0 | API |

## Courts, property, vessels, aircraft

| Source | Access | Limits / terms | Kind |
|---|---|---|---|
| CourtListener / RECAP | free token | 5/min, 50/h, 125/day by default | API + bulk |
| PACER | paid | $0.10 a page | web |
| US county property records | — | **no free national source** | — |
| Equasis | free registration | **automated access forbidden** | web |
| Global Fishing Watch | free token | non-commercial | API |
| FAA aircraft registry | none | daily bulk | bulk |
| OpenSky | none | **automated or live use needs a written licence** | API |

## Other

| Source | Access | Limits / terms |
|---|---|---|
| Wayback CDX | none | be polite |
| Common Crawl index | none | **uptime not verified** |
| RDAP | none | per registry |
| GDELT DOC 2.0 | none | one request per 5 s |

## Router rules

1. **Every party, automatically:** check OpenSanctions (via self-hosted yente) and ICIJ Offshore Leaks loaded locally. This is free and stays local.
2. **Companies**
   - **UK:** Companies House profile, officers and PSC; then BODS; then Contracts Finder and Find a Tender.
   - **US:**
     1. GLEIF
     2. EDGAR submissions and full text
     3. the state registry where one is known (NY, CO, CT, OR, FL)
     4. USAspending
     5. lobbying records by client (lda.gov)
     6. FEC contributions by employer
     7. SAM.gov, on click only
   - **EU:** GLEIF; then TED; then the Transparency Register. Beneficial owners: a checklist for a legitimate-interest request.
   - **Elsewhere:** GLEIF; then OpenCorporates if a key is set; then Aleph.
3. **People**
   - **US, political:** FEC; then FollowTheMoney.org (on click); then congress-legislators and GovTrack; then lobbyists (lda.gov); then CourtListener.
   - **UK:** Companies House officers; then the Register of Interests; then Electoral Commission donations.
   - **EU:** Integrity Watch; then the Transparency Register.
   - **Always:** Wikidata for offices held and family links.
4. **Vessels:** Global Fishing Watch by IMO or MMSI number; then OpenSanctions. Equasis as a link only.
5. **Aircraft:** the FAA bulk file. OpenSky as a link only.
6. **Domains:** RDAP; then Wayback CDX; then Common Crawl.
7. **Investigation type adds sources:**
   - procurement: USAspending, TED, Find a Tender
   - influence: FEC, FollowTheMoney.org, lda.gov, the EU register, UK donations
   - litigation: CourtListener
8. **Never automatic**
   - **Click only:** PACER (costs money), SAM.gov (10 a day), FollowTheMoney.org (1,000 records a year).
   - **Link only:** OpenSky, Equasis.
   - **Optional key:** OpenCorporates.
   - Each source is throttled to its stated limit. SEC gets a contact User-Agent.
   - Non-commercial data carries a licence flag on every finding.

# Tools for crawling, matching and graph analysis

Checked on 5 Oct 2026. Release versions and dates come from PyPI, npm or
Docker Hub, which were fetched directly. GitHub was not reachable from the
research session.

## Crawling and evidence capture

| Name | Licence | Last release | Use |
|---|---|---|---|
| Scrapy | BSD-3 | 2.19.0, 2026-09-10 | Fetcher. Obeys robots.txt and throttles itself. |
| scrapy-playwright | BSD-3 | 0.0.48, 2026-07-10 | Renders JavaScript only where a page needs it. |
| Playwright (python) | Apache-2.0 | 1.63.0, 2026-09-15 | Screenshot or PDF of each page. |
| warcio | Apache-2.0 | 1.8.1, 2026-03-31 | Writes a WARC record per fetch. |
| trafilatura | Apache-2.0 | 2.3.0, 2026-10-02 | Text extraction. |
| Browsertrix Crawler | AGPL-3.0+ | 1.15.0, 2026-10-02 | Optional separate container (WACZ). |
| pywb | GPL-3.0 | 2.10.0, 2026-09-22 | Optional separate container (replay). |
| crawlee-python | Apache-2.0 | 1.10.3, 2026-09-29 | Alternative. robots.txt handling not documented. |
| Crawl4AI | Apache-2.0 | 0.9.4, 2026-09-23 | Not used: it outputs cleaned text, which is weak as evidence. |
| Firecrawl self-hosted | AGPL-3.0 | v2.11.0 | Not used: adds little over Scrapy plus Playwright. |
| savepagenow | MIT | 1.3.1, 2026-01-19 | Opt-in only: it tells the Internet Archive what we are looking at. |

## Matching and cross-referencing

| Name | Licence | Last release | Use |
|---|---|---|---|
| followthemoney | MIT | 4.11.0, 2026-09-03 | Already in use. |
| OpenAleph cross-referencing | MIT | — | Use first. Its matches are "suggestive, not definitive" (docs), so a reporter confirms each one. |
| yente | MIT code; data CC BY-NC | 5.5.0, 2026-06-23 | Self-hosted sanctions and PEP screening. |
| nomenklatura | MIT | 4.17.0, 2026-09-25 | Recorded match and no-match decisions. |
| rigour | MIT | 2.5.0, 2026-09-10 | Name normalisation. Replaces the deprecated `fingerprints`. |
| splink | MIT | 5.0.0, 2026-09-28 | Later: bulk table linking. |

## Graph analysis and red flags

| Name | Licence | Last release | Use |
|---|---|---|---|
| networkx | BSD-3 | 3.7, 2026-09-21 | Cycles, paths, centrality, communities (server). |
| graphology + metrics | MIT | 2.4.2 (metrics), 2026-09-02 | Live views (already in the app). |
| OpenOwnership bodsanalysis rules | MIT | 2024 | Port the rules. |
| Cardinal (ocdscardinal) | MIT | 0.0.8, 2025-11-22 | Procurement indicators over OCDS data. |
| igraph | GPL | 1.0.0 | Not needed at case scale. |
| Digiwhist | CC BY-NC-SA | — | Not used: non-commercial licence. |

## Source clients

| Name | Licence | Last release | Use |
|---|---|---|---|
| edgartools | MIT | 5.60.0, 2026-10-02 | SEC EDGAR. |
| ch-api | MIT | 2.0.0, 2026-06-18 | Companies House. |
| pygleif | MIT | 2026.7.3 | GLEIF. |
| pyopenfec / openfec-sdk | MIT | 2019/2020 | Abandoned. Write a thin client instead. |

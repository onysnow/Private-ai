# Red-flag patterns for "Red Flags"

Research done on 5 Oct 2026. Most pages were read through a summarising
fetcher, so check any quotation against its source before it is shown in
the app word for word. The FATF Annex E indicators were fetched verbatim.

Each pattern below needs data the app holds. When that data has to come
from a lookup, the pattern says so. These are leads, never findings.

## Sources

- **[A]** FATF/Egmont, *Concealment of Beneficial Ownership* (2018), 106 case studies.
  - Executive summary: https://www.fatf-gafi.org/content/dam/fatf-gafi/reports/FATF-Egmont-Concealment-beneficial-ownership-Executive-summary.pdf
  - Annex E indicators: https://www.fatf-gafi.org/content/dam/fatf-gafi/reports/FATF-Egmont-Concealment-beneficial-ownership-annex-E.pdf
- **[B]** World Bank/StAR, *The Puppet Masters* (2011), around 150 grand-corruption cases: https://star.worldbank.org/sites/star/files/puppetmastersv1.pdf
- **[C]** Global Witness, *The Companies We Keep* (2018), UK PSC register: https://globalwitness.org/en/campaigns/corruption-and-money-laundering/the-companies-we-keep/
- **[D]** FinCEN, *The Role of Domestic Shell Companies in Financial Crime and Money Laundering: LLCs* (2006): https://www.fincen.gov/system/files/shared/LLCAssessment_FINAL.pdf
- **[E]** FinCEN advisory FIN-2018-A003 on PEP facilitators: https://www.fincen.gov/system/files/advisory/2018-06-12/PEP%20Facilitator%20Advisory_FINAL%20508.pdf
- **[F]** FFIEC BSA/AML Manual, Appendix G (structuring): https://bsaaml.ffiec.gov/manual/Appendices/08
- **[G]** Fazekas & Kocsis (2015), Corruption Risk Index: https://www.govtransparency.eu/wp-content/uploads/2015/11/GTI_WP2015_2_Fazekas_Kocsis_151015.pdf
  - Bulgarian application: https://www.govtransparency.eu/wp-content/uploads/2023/05/Fazekas-Toth-Poltoratskaia_Corruption-Risks-and-State-Capture-in-Bulgarian-Public-Procurement_WB_working-paper.pdf
- **[H]** Fazekas & Tóth (2016), company age: https://www.govtransparency.eu/wp-content/uploads/2016/12/Fazekas-Toth_Corrupt-companies_20160901.pdf
- **[I]** Tello Arista, Fazekas & Volkotrub (2026), beneficial-ownership risk indicators in procurement: https://link.springer.com/article/10.1007/s10610-025-09654-9
- **[J]** Open Contracting Partnership, *Red flags in public procurement* (2024): https://www.open-contracting.org/wp-content/uploads/2024/12/OCP2024-RedFlagProcurement-1.pdf
- **[K]** OpenOwnership, *Spotting red flags in beneficial ownership datasets* (2024): https://www.openownership.org/en/blog/spotting-red-flags-in-beneficial-ownership-datasets/
- **[L]** Tax Justice Network on ownership chains (2020): https://taxjustice.net/2020/07/06/exploring-uk-companies-legal-ownership-chains-to-detect-red-flags-and-verify-beneficial-ownership-information/
  - Circular ownership (Knobel 2019): https://taxjustice.net/2019/09/06/more-beneficial-ownership-loopholes-to-plug-circular-ownership-control-with-little-ownership-and-companies-as-parties-to-the-trust/
- **[M]** OCCRP, Azerbaijani Laundromat, core companies: https://www.occrp.org/en/project/the-azerbaijani-laundromat/the-core-companies
- **[N]** TI UK, *Hiding in Plain Sight* (2017). Summary only: https://www.bespacific.com/report-hiding-in-plain-sight-how-uk-companies-are-used-to-launder-corrupt-wealth/
- **[O]** Nicolás-Carlock & Luna-Pla (2021), *Frontiers in Physics*: https://www.frontiersin.org/journals/physics/articles/10.3389/fphy.2021.667471/full
- **[P]** Tax Justice Network, Financial Secrecy Index: https://fsi.taxjustice.net/
- **[Q]** How ICIJ handled the Panama and Paradise Papers data: https://datajournalism.com/read/handbook/two/working-with-data/how-icij-deals-with-huge-data-dumps-like-the-panama-and-paradise-papers

## Patterns

**1. Circular ownership**
- **Rule:** a loop in the directed graph of Ownership records.
- **Data:** Ownership owner, asset, percentage and dates.
- **Why:** a small direct stake can give control through the loop [L].
- **Documented:** [C] found 328 UK companies in circular structures. [B] describes chaining corporate vehicles.
- **Innocent:** group cross-holdings, treasury shares, data errors.
- **Today:** computable.

**2. Long chains, or chains through secrecy jurisdictions**
- **Rule:** 5 or more layers to the top owner, or any layer in a high-secrecy jurisdiction ([P] lookup).
- **Documented:** [L] found 5% of UK companies have more than 5 layers. [C] found 72% of foreign corporate owners linked to secrecy jurisdictions. [A] Annex E.
- **Caution:** [I] found country-based indicators largely fail to relate to procurement corruption risk. Weight this pattern down.
- **Today:** layers are computable. Jurisdiction needs a lookup.

**3. Mass directors or nominees**
- **Rule:** one person directs or owns more than N companies.
- **Documented:** [A] Annex E lists "mass" nominees. [C] found over 9,000 companies whose owners each control over 100. [M]: the Laundromat's front owner was a driver in Baku. [I] counts this among its stronger indicators.
- **Innocent:** company secretaries, fund managers, SPVs.
- **Data:** a lookup (officer appointments).

**4. Mass-registration address**
- **Rule:** an address linked to more than N companies.
- **Documented:** [A] Annex E. [N]: half of 766 suspect companies sat at 8 addresses. [C] found over 208,000 companies at "company factory" addresses.
- **Innocent:** agents' and accountants' offices.
- **Data:** a lookup.

**5. Shared address, phone or email between parties with no other link**
- **Documented:** [D]. [J] R043/R044. [O].
- **Innocent:** a shared agent or building, family firms.
- **Today:** computable.

**6. Company formed shortly before a large payment or contract (under one year)**
- **Documented:** [H] and [I] (validated). [A].
- **Innocent:** real start-ups, one-contract joint ventures.
- **Data:** incorporation date (a lookup), plus payments.

**7. Dormant company that suddenly comes alive**
- **Documented:** [A] Annex E (verbatim: "a long period of inactivity following incorporation, followed by a sudden and unexplained increase in financial activities").
- **Today:** computable from payment dates. Better with filings data.

**8. Formed and dissolved within a year**
- **Documented:** [K].
- **Data:** a lookup.

**9. Structuring: several payments just under a reporting threshold**
- **Rule:** from one payer, close in time, together above the threshold.
- **Documented:** [F] (US $10,000 cash). Applies to cash and reportable transactions only.
- **Today:** computable.

**10. Contracts split under a procurement threshold**
- **Documented:** [J] R011/R002 (distances and timeframes depend on context).
- **Data:** procurement data.

**11. Round-number payments**
- **Documented:** [D].
- **Strength:** weak on its own.
- **Today:** computable.

**12. Payment with no stated purpose, or no matching invoice or contract**
- **Documented:** [D]. [A] (false invoicing).
- **Innocent:** incomplete records. Check review status first.
- **Today:** computable.

**13. Stakes clustered just under a disclosure threshold**
- **Rule:** for example, several owners each at 20–24.99% under the UK 25% PSC threshold, especially if those owners are linked to each other.
- **Documented:** [A] Annex E (verbatim: "multiple shareholders who each hold an ownership interest just below the threshold").
- **Innocent:** equal co-founders.
- **Today:** computable.

**14. Family member or associate of a public official holding contracts or payments from the official's body**
- **Documented:** [A]. [E]. [C] found 390 companies tied to legislators. [I] validated. [Q]: Wintris was found by matching leaked records against public figures.
- **Caution:** [E] says most PEPs are dedicated public servants.
- **Data:** offices held (a lookup: Wikidata, OpenSanctions PEPs).

**15. Officers replaced shortly after incorporation, or frequent turnover**
- **Documented:** [A] Annex E. [I] validated frequent beneficial-owner changes.
- **Note:** "Before an event" is an extension of the documented indicator.

**16. Single bidder in a competitive procedure**
- **Documented:** [J] R018. [G] uses it as the core of the Corruption Risk Index.

**17. Short tender or decision period**
- **Documented:** [G] (Bulgaria: 1–6 days high risk). [J] R003/R014.

**18. Non-open procedure, or no published call**
- **Documented:** [G].

**19. Buyer depends on one supplier**
- **Documented:** [G].

**20. Bidders share a beneficial owner**
- **Documented:** [J] R032/R033.

**21. Trust or foundation at the top, or no natural-person owner**
- **Documented:** [A] Annex E. [B]. [C] found over 335,000 companies declaring no owner. [I] validated missing BO data.
- **Innocent:** estate planning, charities, listed companies.

**22. Bearer shares**
- **Documented:** [A]. [B]. Less often exploited than shell companies, per the FATF summary.

## Ranking

- [G] combines flags as a simple average with equal weights, "reflect[ing] our limited understanding".
- [J] warns against re-using weights from other settings, and says flags in combination "can signal a higher likelihood".
- [O] scores networks, not single entities.

The app's rule:

- Equal weights.
- A bonus when flags agree on the same parties.
- A discount for unreviewed evidence.
- Jurisdiction-only flags down-weighted.
- Always show which rules fired and their sources. Never a single opaque score.

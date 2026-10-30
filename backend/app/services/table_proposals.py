"""A mapping proposed for a table when it arrives (BACKLOG "Material types": CSV and XLSX made no payments unless a
person mapped them by hand; DECISIONS_LOG 38).

The app reads a table's header row and its first rows and says what the table looks like: payments (a date, an
amount, a currency, who paid and who was paid, what for) or a list of people or companies. The proposal names each
column's role with how sure it is, and is shown on the file; a person accepts it, changes which column is which, or
dismisses it. Nothing is made until a person accepts: accepting runs the column mapping the same way a mapping made
by hand runs (app/services/table_mappings.py ``run_mapping``), so every party and payment is a proposal to review,
and the decision records who accepted and whether they changed the proposal first.

What a column is comes from its header, in English and a few major languages (German, French, Spanish, Italian,
Dutch, Portuguese), checked against its values: a "Valuta" column holding EUR is a currency, one holding dates is a
value date. Tables differ in ways a FollowTheMoney mapping cannot express, so an accepted proposal also carries how
to read the cells (``prepare``), applied before the mapping runs:

* amounts with thousand separators, either decimal mark ("1.234,56", "1,234.56", "1'234.56"), signs, brackets
  and DR/CR suffixes, and a currency sign or code in the cell; the amount kept is the number without its sign;
* separate money-out and money-in columns (debit/credit), or a column saying which way (D/C, Soll/Haben);
* dates written day first or month first (decided from the values; otherwise from the number style), or in words;
* a single account's statement: one column names the other party, and the account holder (a column, or a name the
  person types) is the payer of money out and the payee of money in.

A payment's kind (app/services/payment_kinds.py) is left unset unless a column says it in words the kinds use.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Document, TableMapping, TableProposalDecision
from app.services.table_mappings import DERIVED, Table, TableError

SAMPLE = 50            # rows a proposal reads besides the header
MIN_CONFIDENCE = 0.5   # below this, nothing is proposed

PAYMENT_ROLES: dict[str, str] = {
    "date": "date", "value_date": "value date", "amount": "amount", "debit": "money out", "credit": "money in",
    "direction": "which way", "currency": "currency", "payer": "payer", "payee": "payee", "counterparty": "other party",
    "holder": "account holder", "purpose": "purpose", "reference": "reference", "kind": "kind of payment",
}
PARTY_ROLES: dict[str, str] = {
    "name": "name", "first_name": "first name", "last_name": "last name", "birth_date": "date of birth",
    "nationality": "nationality", "country": "country", "address": "address", "registration_number": "registration number",
    "incorporation_date": "incorporated", "email": "email", "phone": "phone",
}

# (phrase, weight, exact only). Phrases are written as _norm writes headers: lower case, no accents, words only.
WORDS: dict[str, list[tuple[str, float, bool]]] = {
    "date": [(p, 0.95, False) for p in (
        "date", "booking date", "transaction date", "posting date", "posted date", "payment date", "transfer date", "wire date",
        "txn date", "trans date", "entry date", "execution date", "datum", "buchungsdatum", "buchungstag", "transaktionsdatum",
        "date operation", "date de l operation", "date d operation", "date comptable", "fecha", "fecha operacion",
        "fecha de operacion", "fecha contable", "data", "data operazione", "data contabile", "boekdatum", "transactiedatum",
        "data movimento", "data lancamento")] + [("posted", 0.7, True), ("when", 0.6, True)],
    "value_date": [(p, 0.95, False) for p in (
        "value date", "valuta", "valutadatum", "wertstellung", "wertstellungsdatum", "date de valeur", "date valeur",
        "fecha valor", "data valuta", "valutadatum", "rentedatum", "data valor")],
    "amount": [(p, 0.95, False) for p in (
        "amount", "amt", "transaction amount", "payment amount", "transfer amount", "wire amount", "sum", "total",
        "betrag", "umsatz", "montant", "importe", "monto", "importo", "bedrag", "valor", "quantia", "kwota", "summe")]
        + [("value", 0.6, True), ("debit credit", 0.6, True), ("net", 0.5, True)],
    "debit": [(p, 0.95, False) for p in (
        "debit", "debits", "debit amount", "withdrawal", "withdrawals", "paid out", "money out", "outflow", "outgoing",
        "soll", "lastschrift", "belastung", "ausgang", "ausgaben", "debit eur", "debe", "cargo", "cargos", "dare", "uscite",
        "addebiti", "af", "debito")] + [("out", 0.8, True), ("dr", 0.85, True)],
    "credit": [(p, 0.95, False) for p in (
        "credit", "credits", "credit amount", "deposit", "deposits", "paid in", "money in", "inflow", "incoming",
        "haben", "gutschrift", "eingang", "einnahmen", "haber", "abono", "abonos", "avere", "entrate", "accrediti", "bij",
        "credito")] + [("in", 0.8, True), ("cr", 0.85, True)],
    "direction": [(p, 0.95, True) for p in (
        "debit credit", "credit debit", "dr cr", "cr dr", "d c", "c d", "soll haben", "s h", "in out", "direction",
        "debit or credit", "sens", "debe haber")],
    "currency": [(p, 0.95, False) for p in (
        "currency", "ccy", "cur", "curr", "currency code", "waehrung", "wahrung", "devise", "monnaie", "moneda", "divisa",
        "valuta", "munt", "moeda")],
    "payer": [(p, 0.95, False) for p in (
        "payer", "payor", "payer name", "sender", "sender name", "originator", "originator name", "ordering party",
        "ordering customer", "remitter", "debtor", "debtor name", "paid by", "auftraggeber", "zahler", "absender",
        "donneur d ordre", "emetteur", "ordenante", "emisor", "pagador", "ordinante", "pagatore", "opdrachtgever",
        "betaler", "remetente")] + [("from", 0.85, True)],
    "payee": [(p, 0.95, False) for p in (
        "payee", "payee name", "recipient", "recipient name", "beneficiary", "beneficiary name", "creditor", "creditor name",
        "receiver", "paid to", "empfaenger", "empfanger", "zahlungsempfaenger", "zahlungsempfanger", "beguenstigter",
        "begunstigter", "beneficiaire", "destinataire", "beneficiario", "destinatario", "begunstigde", "ontvanger", "favorecido")]
        + [("to", 0.85, True)],
    "counterparty": [(p, 0.9, False) for p in (
        "counterparty", "counter party", "counterpart", "counterparty name", "other party", "payee payer", "payer payee",
        "beneficiary remitter", "auftraggeber empfaenger", "auftraggeber empfanger", "beguenstigter zahlungspflichtiger",
        "begunstigter zahlungspflichtiger", "name des zahlungsbeteiligten", "zahlungsbeteiligter", "contrepartie", "tiers",
        "contraparte", "controparte", "tegenpartij", "naam tegenpartij", "contraparte nome")]
        + [("name", 0.6, True), ("party", 0.7, True), ("merchant", 0.75, True)],
    "holder": [(p, 0.9, False) for p in (
        "account holder", "account name", "account owner", "holder", "kontoinhaber", "inhaber", "titulaire", "titular",
        "titolare", "rekeninghouder", "intestatario")],
    "purpose": [(p, 0.9, False) for p in (
        "purpose", "description", "details", "memo", "narrative", "narration", "particulars", "remarks", "comment",
        "comments", "note", "notes", "payment details", "transaction details", "remittance information", "verwendungszweck",
        "buchungstext", "beschreibung", "libelle", "motif", "objet", "concepto", "descripcion", "causale", "descrizione",
        "omschrijving", "mededelingen", "descricao", "historico")],
    "reference": [(p, 0.9, False) for p in (
        "reference", "ref", "reference number", "ref no", "transaction id", "transaction number", "txn id", "transaction ref",
        "end to end id", "cheque no", "check number", "referenz", "mandatsreferenz", "reference de l operation", "referencia",
        "riferimento", "kenmerk", "referencia da operacao")],
    "kind": [(p, 0.85, False) for p in (
        "payment type", "transaction type", "type of payment", "kind of payment", "payment kind", "kind", "type",
        "buchungsart", "umsatzart", "type d operation", "tipo", "tipo de operacion", "tipologia")],
    # People and companies
    "name": [(p, 0.95, False) for p in (
        "name", "full name", "company", "company name", "entity", "entity name", "organisation", "organization",
        "organisation name", "organization name", "person", "individual", "party", "nom", "raison sociale", "nombre",
        "razon social", "nome", "ragione sociale", "firma", "firmenname", "unternehmen", "naam", "bedrijf", "empresa",
        "societe", "legal name", "registered name", "beneficial owner", "owner", "director", "shareholder", "officer")],
    "first_name": [(p, 0.95, False) for p in ("first name", "given name", "forename", "vorname", "prenom", "nombre de pila", "voornaam")],
    "last_name": [(p, 0.95, False) for p in ("last name", "surname", "family name", "nachname", "nom de famille", "apellido", "apellidos",
                                             "cognome", "achternaam")],
    "birth_date": [(p, 0.95, False) for p in ("date of birth", "birth date", "birthdate", "dob", "born", "geburtsdatum",
                                              "date de naissance", "fecha de nacimiento", "data di nascita", "geboortedatum")],
    "nationality": [(p, 0.95, False) for p in ("nationality", "citizenship", "staatsangehoerigkeit", "staatsangehorigkeit",
                                               "nationalite", "nacionalidad", "nazionalita", "nationaliteit")],
    "country": [(p, 0.9, False) for p in ("country", "jurisdiction", "country of incorporation", "land", "pays", "pais", "paese")],
    "address": [(p, 0.9, False) for p in ("address", "registered address", "adresse", "anschrift", "direccion", "indirizzo", "adres")],
    "registration_number": [(p, 0.95, False) for p in (
        "registration number", "company number", "registration no", "reg no", "company no", "crn", "handelsregisternummer",
        "registernummer", "siren", "siret", "kvk", "kvk nummer", "numero de registro", "codice fiscale", "partita iva", "lei")],
    "incorporation_date": [(p, 0.95, False) for p in ("incorporation date", "date of incorporation", "incorporated",
                                                      "founded", "gruendungsdatum", "grundungsdatum", "date de creation",
                                                      "fecha de constitucion")],
    "email": [(p, 0.95, False) for p in ("email", "e mail", "email address", "courriel", "correo")],
    "phone": [(p, 0.95, False) for p in ("phone", "telephone", "tel", "mobile", "phone number", "telefon", "telefono", "telefoon")],
}

# A header with one of these words names an account, a number or a place, not a party (unless a phrase says so).
NOT_A_NAME = {"account", "acct", "iban", "bic", "swift", "bank", "number", "no", "nr", "id", "code", "address", "country",
              "city", "type", "kind", "reference", "ref", "konto", "kontonummer", "compte", "cuenta", "conto", "doc", "document",
              "page", "file", "url", "link", "date", "amount"}
PARTY_ROLE_NAMES = {"payer", "payee", "counterparty", "holder", "name"}

CURRENCIES = set((
    "AED ARS AUD AZN BAM BGN BHD BRL BYN CAD CHF CLP CNY COP CZK DKK DZD EGP EUR GBP GEL HKD HRK HUF IDR ILS INR IQD IRR "
    "ISK JOD JPY KES KGS KRW KWD KZT LBP LKR MAD MDL MKD MXN MYR NGN NOK NZD OMR PEN PHP PKR PLN QAR RON RSD RUB SAR SEK "
    "SGD THB TJS TMT TND TRY TWD UAH USD UYU UZS VEF VES VND XAF XOF ZAR BTC").split())
SIGNS = {"€": "EUR", "£": "GBP", "$": "USD", "US$": "USD", "¥": "JPY", "₽": "RUB", "₹": "INR", "₺": "TRY", "₴": "UAH",
         "zł": "PLN", "₪": "ILS", "₩": "KRW", "₦": "NGN", "R$": "BRL", "S$": "SGD", "A$": "AUD", "C$": "CAD", "HK$": "HKD"}
OUT_WORDS = {"d", "dr", "debit", "debito", "debit.", "s", "soll", "out", "-", "withdrawal", "lastschrift", "belastung", "debe", "cargo", "dare", "af"}
IN_WORDS = {"c", "cr", "credit", "credito", "h", "haben", "in", "+", "deposit", "gutschrift", "haber", "abono", "avere", "bij"}
KIND_WORDS = {
    "transfer": "transfer", "wire": "transfer", "wire transfer": "transfer", "bank transfer": "transfer", "ueberweisung": "transfer",
    "uberweisung": "transfer", "virement": "transfer", "transferencia": "transfer", "bonifico": "transfer", "overboeking": "transfer",
    "loan": "loan", "darlehen": "loan", "kredit": "loan", "pret": "loan", "prestamo": "loan", "prestito": "loan", "lening": "loan",
    "fee": "fee", "fees": "fee", "commission": "fee", "gebuehr": "fee", "gebuhr": "fee", "frais": "fee", "comision": "fee",
    "commissione": "fee", "honorarium": "fee", "consulting fee": "fee",
    "settlement": "settlement", "vergleich": "settlement", "reglement": "settlement", "acuerdo": "settlement",
    "price": "price", "purchase price": "price", "kaufpreis": "price", "prix": "price", "precio": "price", "prezzo": "price",
    "fine": "fine", "penalty": "fine", "strafe": "fine", "bussgeld": "fine", "amende": "fine", "multa": "fine", "boete": "fine",
    "court order": "ordered", "ordered": "ordered", "judgment": "ordered", "judgement": "ordered", "restitution": "ordered",
    "compensation": "ordered", "disgorgement": "ordered",
}
MONTHS = {
    **{m: i for i, m in enumerate(("jan feb mar apr may jun jul aug sep oct nov dec").split(), 1)},
    **{m: i for i, m in enumerate(("january february march april may june july august september october november december").split(), 1)},
    **{m: i for i, m in enumerate(("januar februar marz april mai juni juli august september oktober november dezember").split(), 1)},
    **{m: i for i, m in enumerate(("janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre").split(), 1)},
    **{m: i for i, m in enumerate(("enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre").split(), 1)},
    **{m: i for i, m in enumerate(("gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre").split(), 1)},
    **{m: i for i, m in enumerate(("januari februari maart april mei juni juli augustus september oktober november december").split(), 1)},
    "sept": 9, "okt": 10, "dez": 12, "mrz": 3, "mae": 3, "janv": 1, "fevr": 2, "avr": 4, "juil": 7, "ene": 1, "abr": 4,
    "ago": 8, "dic": 12, "gen": 1, "mag": 5, "giu": 6, "lug": 7, "set": 9, "ott": 10, "mei": 5, "mrt": 3, "okt.": 10,
}


def _plain(text: str) -> str:
    """Lower case, accents and ß spelled out the way the word lists write them."""
    text = text.replace("ß", "ss").replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("Ä", "ae").replace("Ö", "oe").replace("Ü", "ue")
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def _norm(header: str) -> str:
    """A header as the word lists write it: lower case, no accents, words separated by one space; what is in
    brackets is left out ("Amount (EUR)" is "amount")."""
    text = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", header)
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)        # camelCase
    text = re.sub(r"[^0-9a-z]+", " ", _plain(text))
    return " ".join(text.split())


def _norm_variants(header: str) -> list[str]:
    """The header, and the header with ä/ö/ü written plainly (both spellings occur in exports)."""
    plain = re.sub(r"[^0-9a-z]+", " ", "".join(c for c in unicodedata.normalize("NFKD", re.sub(r"\([^)]*\)", " ", header))
                                                 if not unicodedata.combining(c)).lower())
    return list(dict.fromkeys([_norm(header), " ".join(plain.split())]))


def _header_score(header: str, role: str) -> float:
    best = 0.0
    for norm in _norm_variants(header):
        tokens = norm.split()
        for phrase, weight, exact in WORDS.get(role, []):
            if norm == phrase:
                best = max(best, weight)
                continue
            if exact:
                continue
            words = phrase.split()
            if any(tokens[i:i + len(words)] == words for i in range(len(tokens) - len(words) + 1)):
                if role in PARTY_ROLE_NAMES and set(tokens) & NOT_A_NAME and not set(words) & NOT_A_NAME:
                    continue
                # A longer header that contains the phrase is less sure; "value date" is not a "value".
                best = max(best, weight * (0.8 if len(words) > 1 else 0.7))
        if role == "date" and any(t.endswith("datum") or t.endswith("date") for t in tokens):
            best = max(best, 0.6)
    return best


# --- reading cells ----------------------------------------------------------------------------------------------------


def currency_of(text: str) -> str | None:
    """A currency code or sign in a cell, as its ISO code."""
    value = text.strip()
    if value.upper() in CURRENCIES:
        return value.upper()
    return SIGNS.get(value)


def _cell_currency(text: str) -> str | None:
    for sign in sorted(SIGNS, key=len, reverse=True):
        if sign in text:
            return SIGNS[sign]
    match = re.search(r"\b([A-Z]{3})\b", text)
    return match.group(1) if match and match.group(1) in CURRENCIES else None


@dataclass
class Number:
    value: Decimal              # with its sign
    currency: str | None
    way: str | None             # "out" or "in" when the cell says so (DR/CR)


def read_number(text: str, decimal: str = ".") -> Number | None:
    """An amount as written in a cell: thousand separators, the decimal mark ``decimal``, a sign before or after,
    brackets for a negative, a DR/CR suffix, a currency sign or code. None when it is not a number."""
    s = text.strip().replace("−", "-").replace("–", "-")
    if not s:
        return None
    way = None
    suffix = re.search(r"\s*\b(DR|CR|Dr|Cr|dr|cr|D|C|S|H)\.?$", s)
    if suffix and re.search(r"\d", s[:suffix.start()]):
        word = suffix.group(1).lower()
        way = "out" if word in {"dr", "d", "s"} else "in"
        s = s[:suffix.start()]
    currency = _cell_currency(s)
    code = re.match(r"^([A-Za-z]{3})\s*(?=[\d(+\-.,])|.*?[\d)]\s*([A-Za-z]{3})$", s)
    if code and (code.group(1) or code.group(2)).upper() in CURRENCIES:
        s = s[code.end(1):] if code.group(1) else s[:code.start(2)]
    s = re.sub(r"US\$|R\$|S\$|A\$|C\$|HK\$|[€£$¥₽₹₺₴₪₩₦]|zł", "", s).strip()
    negative = False
    if s.startswith("(") and s.endswith(")"):
        negative, s = True, s[1:-1].strip()
    if s.startswith(("-", "+")):
        negative, s = s[0] == "-", s[1:].strip()
    elif s.endswith(("-", "+")):
        negative, s = s[-1] == "-", s[:-1].strip()
    s = re.sub(r"[\s  '’`]", "", s)
    if decimal == ",":
        if re.fullmatch(r"\d{1,3}(,\d{3})+\.\d+", s):     # an English number in a European column: read it as written
            s = s.replace(",", "")
        else:
            s = s.replace(".", "").replace(",", ".")
    else:
        if re.fullmatch(r"\d{1,3}(\.\d{3})+,\d+", s):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    if not re.fullmatch(r"\d+(\.\d+)?|\.\d+", s):
        return None
    try:
        value = Decimal(s)
    except InvalidOperation:
        return None
    return Number(-value if negative else value, currency, way)


def number_text(value: Decimal) -> str:
    """An amount as the ledger keeps it: no sign, no separators, no trailing zeros after the decimal mark."""
    text = format(abs(value), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def guess_decimal(values: list[str]) -> str:
    """Which decimal mark a column's amounts use, from the ones that show it."""
    comma = dot = 0
    for value in values:
        core = re.sub(r"[^\d.,]", "", value.replace("'", "").replace(" ", "").replace(" ", ""))
        if re.fullmatch(r"\d{1,3}(\.\d{3})+(,\d+)?|\d+,\d{1,2}", core):
            comma += 1
        elif re.fullmatch(r"\d{1,3}(,\d{3})+(\.\d+)?|\d+\.\d{1,2}", core):
            dot += 1
    return "," if comma > dot else "."


_NUMERIC_DATE = re.compile(r"^(\d{1,4})[./\-](\d{1,2})[./\-](\d{1,4})(?:[ T].*)?$")


def read_date(text: str, order: str = "DMY") -> str | None:
    """A date as written in a cell, as YYYY-MM-DD (or YYYY-MM, YYYY when that is all it says). ``order`` says
    whether a numeric date is day first (DMY) or month first (MDY); a four-digit first part is always year first."""
    s = text.strip()
    if not s:
        return None
    if re.fullmatch(r"\d{4}(-\d{2})?", s):
        return s
    if re.fullmatch(r"\d{8}", s):
        return _iso(int(s[:4]), int(s[4:6]), int(s[6:]))
    match = _NUMERIC_DATE.match(s)
    if match:
        a, b, c = match.groups()
        if len(a) == 4:
            return _iso(int(a), int(b), int(c))
        if len(c) not in (2, 4):
            return None
        full_year = int(c) + (2000 if int(c) < 50 else 1900) if len(c) == 2 else int(c)
        first, second = (int(a), int(b)) if order == "DMY" else (int(b), int(a))
        return _iso(full_year, second, first)
    return _worded_date(re.sub(r"[,.]", " ", _plain(s)).replace("-", " ").split())


def _worded_date(words: list[str]) -> str | None:
    """"May 20, 2011", "20 May 2011", "20-May-2011", "20. Mai 2011", "1er mars 2012"."""
    if len(words) < 3:
        return None
    day: int | None = None
    month: int | None = None
    year: int | None = None
    for word in words[:4]:
        if word.isdigit() and len(word) == 4:
            year = int(word)
        elif word.isdigit() and len(word) <= 2:
            day = int(word)
        elif word.rstrip(".") in MONTHS:
            month = MONTHS[word.rstrip(".")]
        elif re.fullmatch(r"\d{1,2}(st|nd|rd|th|er)", word):
            day = int(re.sub(r"\D", "", word))
    if day and month and year:
        return _iso(year, month, day)
    return None


def _iso(year: int, month: int, day: int) -> str | None:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def guess_date_order(values: list[str], decimal: str) -> str:
    """Day first or month first, from the dates that show it (a part above 12); otherwise day first, except in a
    table whose amounts are written the English way and has no day-first date."""
    day_first = month_first = 0
    for value in values:
        match = _NUMERIC_DATE.match(value.strip())
        if not match or len(match.group(1)) == 4:
            continue
        a, b = int(match.group(1)), int(match.group(2))
        if a > 12 >= b:
            day_first += 1
        elif b > 12 >= a:
            month_first += 1
        elif "." in value:
            day_first += 1        # 03.04.2024 is written day first wherever dots are used
    if day_first or month_first:
        return "DMY" if day_first >= month_first else "MDY"
    return "MDY" if decimal == "." and any("/" in v for v in values) else "DMY"


def _way(text: str) -> str | None:
    word = _plain(text.strip()).rstrip(".")
    return "out" if word in OUT_WORDS else "in" if word in IN_WORDS else None


def payment_kind_of(text: str) -> str | None:
    """A payment kind when a cell says it in the kinds' own words (app/services/payment_kinds.py)."""
    return KIND_WORDS.get(" ".join(re.sub(r"[^0-9a-z]+", " ", _plain(text)).split()))


# --- recognising the columns ------------------------------------------------------------------------------------------


def _fit(role: str, values: list[str], decimal: str, order: str) -> float:
    """How well a column's values suit the role: the share of its non-empty sample cells that read as it."""
    filled = [v for v in values if v.strip()]
    if not filled:
        return 0.5
    def share(test: Any) -> float:
        return sum(1 for v in filled if test(v)) / len(filled)
    if role in {"date", "value_date", "birth_date", "incorporation_date"}:
        return share(lambda v: read_date(v, order) is not None)
    if role in {"amount", "debit", "credit"}:
        return share(lambda v: read_number(v, decimal) is not None)
    if role == "currency":
        return share(lambda v: currency_of(v) is not None)
    if role == "direction":
        return share(lambda v: _way(v) is not None)
    if role == "kind":
        return share(lambda v: payment_kind_of(v) is not None)
    if role == "email":
        return share(lambda v: "@" in v)
    if role == "phone":
        return share(lambda v: len(re.sub(r"\D", "", v)) >= 6)
    if role in PARTY_ROLE_NAMES | {"first_name", "last_name", "nationality", "country", "address"}:
        return share(lambda v: bool(re.search(r"[^\W\d_]", v)) and read_number(v) is None and read_date(v, order) is None)
    return 1.0


def _why(role: str, header: float, fit: float) -> str:
    said = "its header" if header >= 0.9 else "a word in its header" if header > 0 else "its values"
    if fit >= 0.99:
        return f"From {said}; every value in the first rows reads as {_label(role)}"
    if fit >= 0.5:
        return f"From {said}; {round(fit * 100)}% of the values in the first rows read as {_label(role)}"
    return f"From {said}; few values in the first rows read as {_label(role)}"


def _label(role: str) -> str:
    return PAYMENT_ROLES.get(role) or PARTY_ROLES.get(role) or role


@dataclass
class Guess:
    column: str
    role: str
    confidence: float
    why: str


def _guesses(table: Table, roles: dict[str, str], decimal: str, order: str) -> dict[str, list[Guess]]:
    """Every role each column could have, most likely first."""
    out: dict[str, list[Guess]] = {}
    for column in table.columns:
        if column.startswith(DERIVED):
            continue
        values = [cells.get(column, "") for _, cells in table.rows[:SAMPLE]]
        found = []
        for role in roles:
            header = _header_score(column, role)
            if header == 0 and role == "currency":
                header = 0.6 if _fit(role, values, decimal, order) >= 0.9 and any(v.strip() for v in values) else 0.0
            if header == 0:
                continue
            fit = _fit(role, values, decimal, order)
            if fit < 0.3:
                continue
            found.append(Guess(column, role, round(header * (0.4 + 0.6 * fit), 2), _why(role, header, fit)))
        out[column] = sorted(found, key=lambda g: -g.confidence)
    return out


def _assign(guesses: dict[str, list[Guess]], *, many: set[str]) -> dict[str, Guess]:
    """One role per column and one column per role (except the roles in ``many``), the surest first."""
    pairs = sorted((g for found in guesses.values() for g in found), key=lambda g: -g.confidence)
    taken_roles: set[str] = set()
    out: dict[str, Guess] = {}
    for guess in pairs:
        if guess.column in out or (guess.role in taken_roles and guess.role not in many):
            continue
        out[guess.column] = guess
        taken_roles.add(guess.role)
    return out


def _header_currency(columns: list[str]) -> str | None:
    for column in columns:
        match = re.search(r"\b([A-Z]{3})\b", column)
        if match and match.group(1) in CURRENCIES:
            return match.group(1)
        for sign, code in SIGNS.items():
            if f"({sign})" in column or column.strip().endswith(f" {sign}"):
                return code
    return None


def _shape(by_role: dict[str, str], table: Table, decimal: str) -> str | None:
    """How the payments are laid out: "pair" (a payer and a payee per row), "statement" (one account's rows, one
    column naming the other party, a way to tell money out from money in), or None."""
    if "payer" in by_role and "payee" in by_role:
        return "pair"
    if not ({"amount", "debit", "credit"} & set(by_role)):
        return None
    other = [r for r in ("counterparty", "payer", "payee") if r in by_role]
    if len(other) != 1:
        return None
    if other[0] in {"payer", "payee"}:
        return "statement"
    return "statement" if _tells_the_way(by_role, table, decimal) else None


def _tells_the_way(by_role: dict[str, Any], table: Table, decimal: str) -> bool:
    """Whether the table says which way each row's money went: money-out and money-in columns, a column saying
    which way, or signed amounts (a minus, brackets, DR/CR)."""
    if {"debit", "credit", "direction"} & set(by_role):
        return True
    return "amount" in by_role and _signed(table, _first(by_role["amount"]), decimal)


def _first(columns: str | list[str]) -> str:
    return columns if isinstance(columns, str) else columns[0]


def _signed(table: Table, column: str, decimal: str) -> bool:
    numbers = [read_number(cells.get(column, ""), decimal) for _, cells in table.rows]
    return any(n is not None and (n.value < 0 or n.way is not None) for n in numbers)


def _payment_roles(assigned: dict[str, Guess]) -> dict[str, str]:
    return {g.role: g.column for g in assigned.values() if g.role != "purpose"}


def propose_for_table(table: Table) -> dict[str, Any] | None:
    """What the table looks like and which column is which, or None when it looks like neither payments nor a list
    of people or companies."""
    if not table.rows:
        return None
    sample = [cells for _, cells in table.rows[:SAMPLE]]
    numberish = [v for cells in sample for v in cells.values() if re.search(r"\d", v)]
    decimal = guess_decimal(numberish)
    dated = [c for c in table.columns if any(_header_score(c, r) for r in ("date", "value_date", "birth_date", "incorporation_date"))]
    order = guess_date_order([cells.get(c, "") for cells in sample for c in dated], decimal)

    assigned = _assign(_guesses(table, PAYMENT_ROLES, decimal, order), many={"purpose"})
    by_role = _payment_roles(assigned)
    if "date" not in by_role and "value_date" in by_role:
        # A table with only a value date: that is the payment's date.
        by_role["date"] = by_role.pop("value_date")
        guess = assigned[by_role["date"]]
        assigned[by_role["date"]] = Guess(guess.column, "date", guess.confidence, guess.why + "; the only date, so it is the payment's date")
    shape = _shape(by_role, table, decimal)
    purposes = [g for g in assigned.values() if g.role == "purpose"]
    if (shape is None and purposes and not ({"counterparty", "payer", "payee"} & set(by_role))
            and ({"amount", "debit", "credit"} & set(by_role)) and _tells_the_way(by_role, table, decimal)):
        # A bank statement with no column for the other party: its description usually starts with the name.
        first = purposes[0]
        assigned[first.column] = Guess(first.column, "counterparty", round(first.confidence * 0.6, 2),
                                       "No column names the other party, so the description is read as its name")
        by_role["counterparty"] = first.column
        shape = "statement"
    if shape is not None:
        if shape == "pair":
            for column, guess in list(assigned.items()):
                if guess.role in {"counterparty", "holder"}:
                    del assigned[column]
        proposal = _proposal("payments", table, assigned, decimal, order, shape=shape)
        if proposal["confidence"] >= MIN_CONFIDENCE:
            return proposal

    assigned = _assign(_guesses(table, PARTY_ROLES, decimal, order), many=set())
    roles = {g.role for g in assigned.values()}
    if "name" in roles or {"first_name", "last_name"} <= roles:
        proposal = _proposal("parties", table, assigned, decimal, order, shape=None)
        if proposal["confidence"] >= MIN_CONFIDENCE:
            return proposal
    return None


def _party_schema(roles: dict[str, str], table: Table) -> str:
    if {"first_name", "last_name", "birth_date", "nationality"} & set(roles):
        return "Person"
    if {"registration_number", "incorporation_date"} & set(roles):
        return "Company"
    header = _norm(roles.get("name", ""))
    if header in {"person", "individual", "full name", "director", "officer", "beneficial owner"}:
        return "Person"
    if header in {"company", "company name", "firma", "firmenname", "unternehmen", "empresa", "societe", "bedrijf",
                  "raison sociale", "razon social", "ragione sociale", "registered name"}:
        return "Company"
    return "LegalEntity"


def _proposal(kind: str, table: Table, assigned: dict[str, Guess], decimal: str, order: str, *, shape: str | None) -> dict[str, Any]:
    columns = [{"column": c, "role": assigned[c].role if c in assigned else None,
                "confidence": assigned[c].confidence if c in assigned else None,
                "why": assigned[c].why if c in assigned else None}
               for c in table.columns if not c.startswith(DERIVED)]
    roles = {g.role: g.column for g in assigned.values() if g.role != "purpose"}
    if kind == "payments":
        holder = None
        if shape == "statement" and "holder" in roles:
            holder = next((cells.get(roles["holder"], "").strip() for _, cells in table.rows if cells.get(roles["holder"], "").strip()), None)
        key = ["amount" if "amount" in roles else "debit" if "debit" in roles else "credit"]
        key += ["payer", "payee"] if shape == "pair" else [next(r for r in ("counterparty", "payer", "payee") if r in roles)]
        key += ["date"] if "date" in roles else []
        sure = [assigned[roles[r]].confidence for r in key]
        confidence = round(sum(sure) / len(sure) * (1.0 if "date" in roles else 0.85), 2)
        out: dict[str, Any] = {"kind": "payments", "schema": None, "shape": shape, "account_holder": holder}
    else:
        sure = [g.confidence for g in assigned.values() if g.role in {"name", "first_name", "last_name"}]
        confidence = round(max(sure), 2) if sure else 0.0
        out = {"kind": "parties", "schema": _party_schema(roles, table), "shape": None, "account_holder": None}
    out.update({"sheet": table.sheet, "columns": columns, "confidence": confidence, "decimal": decimal, "date_order": order,
                "currency": _header_currency(table.columns)})
    out["sample"] = read_sample(table, out)
    return out


# --- from roles to a mapping ------------------------------------------------------------------------------------------


def roles_of(proposal: dict[str, Any]) -> dict[str, list[str]]:
    """Role -> the columns that have it."""
    out: dict[str, list[str]] = {}
    for item in proposal.get("columns") or []:
        if item.get("role"):
            out.setdefault(str(item["role"]), []).append(str(item["column"]))
    return out


def check_roles(proposal: dict[str, Any], table: Table) -> dict[str, list[str]]:
    """The roles as given, refused in plain words when they cannot make what the proposal says."""
    roles = roles_of(proposal)
    known = set(table.columns)
    allowed = PAYMENT_ROLES if proposal["kind"] == "payments" else PARTY_ROLES
    for role, columns in roles.items():
        if role not in allowed:
            raise TableError(f"“{role}” is not something a column of {proposal['kind']} can be")
        missing = [c for c in columns if c not in known]
        if missing:
            raise TableError(f"There is no column named “{missing[0]}”")
        if len(columns) > 1 and role != "purpose":
            raise TableError(f"Only one column can be the {_label(role)}: {', '.join(columns)}")
    if proposal["kind"] == "parties":
        if "name" not in roles and not ({"first_name", "last_name"} <= set(roles)):
            raise TableError("Say which column holds the names")
        return roles
    if not ({"amount", "debit", "credit"} & set(roles)):
        raise TableError("Say which column holds the amount, or which hold money out and money in")
    if "amount" in roles and ({"debit", "credit"} & set(roles)):
        raise TableError("An amount column and money-out or money-in columns cannot both be read; keep one")
    one = {"date": roles.get("date"), "value_date": roles.get("value_date")}
    if not one["date"] and one["value_date"]:
        roles["date"] = roles.pop("value_date")
    if "payer" in roles and "payee" in roles:
        proposal["shape"] = "pair"
        return roles
    others = [r for r in ("counterparty", "payer", "payee") if r in roles]
    if len(others) != 1:
        raise TableError("Say which column is the payer and which the payee, or, for one account's statement, which column names the other party")
    proposal["shape"] = "statement"
    if not ((proposal.get("account_holder") or "").strip() or "holder" in roles):
        raise TableError("Say whose account this is: the account holder pays the money out and receives the money in")
    if others[0] == "counterparty" and not _tells_the_way(roles, table, proposal.get("decimal") or "."):
        raise TableError("Nothing in the table says which way the money went: choose money-out and money-in columns, or a column saying which way")
    return roles


def prepare_of(proposal: dict[str, Any], roles: dict[str, list[str]], table: Table) -> dict[str, Any]:
    """How to read the cells before the mapping runs (app/services/table_mappings.py ``prepared``). ``signed``: the
    amounts carry a sign somewhere in the table, so a statement's sign says which way each row's money went even
    when its one party column is headed payee or payer."""
    decimal = proposal.get("decimal") or "."
    return {"kind": proposal["kind"], "shape": proposal.get("shape"), "roles": roles, "decimal": decimal,
            "date_order": proposal.get("date_order") or "DMY", "account_holder": (proposal.get("account_holder") or "").strip() or None,
            "currency": proposal.get("currency"),
            "signed": bool(roles.get("amount")) and _signed(table, roles["amount"][0], decimal)}


def mapping_of(proposal: dict[str, Any], roles: dict[str, list[str]]) -> dict[str, Any]:
    """The FollowTheMoney mapping the proposal makes, reading the prepared cells."""
    def col(name: str) -> str:
        return DERIVED + name
    if proposal["kind"] == "parties":
        schema = proposal.get("schema") or "LegalEntity"
        from followthemoney import model

        ftm = model.get(schema)
        props: dict[str, Any] = {"name": {"column": col("name")}}
        for role, prop in (("first_name", "firstName"), ("last_name", "lastName"), ("birth_date", "birthDate"),
                           ("nationality", "nationality"), ("country", "country"), ("address", "address"),
                           ("registration_number", "registrationNumber"), ("incorporation_date", "incorporationDate"),
                           ("email", "email"), ("phone", "phone")):
            if role in roles and ftm is not None and ftm.get(prop) is not None:
                props[prop] = {"column": col(role)}
        return {"party": {"schema": schema, "keys": [col("name")], "properties": props}}
    payment_props: dict[str, Any] = {"payer": {"entity": "payer"}, "beneficiary": {"entity": "payee"},
                                     "amount": {"column": col("amount")}, "currency": {"column": col("currency")},
                                     "date": {"column": col("date")}}
    keys = [col("date"), col("payer"), col("payee"), col("amount")]
    if "purpose" in roles:
        payment_props["purpose"] = {"column": col("purpose")}
    if "reference" in roles:
        payment_props["transactionNumber"] = {"column": col("reference")}
        keys.append(col("reference"))
    # The same name paying in one row and paid in another is one party: both ends share the key literal.
    return {
        "payer": {"schema": "LegalEntity", "keys": [col("payer")], "key_literal": "party", "properties": {"name": {"column": col("payer")}}},
        "payee": {"schema": "LegalEntity", "keys": [col("payee")], "key_literal": "party", "properties": {"name": {"column": col("payee")}}},
        "payment": {"schema": "Payment", "keys": keys, "properties": payment_props},
    }


def prepare_row(cells: dict[str, str], prepare: dict[str, Any]) -> tuple[dict[str, str], list[str]]:
    """The cells a proposal's mapping reads from one row, and what in the row could not be read."""
    roles: dict[str, list[str]] = prepare.get("roles") or {}
    decimal = prepare.get("decimal") or "."
    order = prepare.get("date_order") or "DMY"
    problems: list[str] = []

    def cell(role: str) -> str:
        columns = roles.get(role) or []
        return (cells.get(columns[0]) or "").strip() if columns else ""

    def as_date(role: str) -> str:
        text = cell(role)
        found = read_date(text, order) if text else None
        if text and found is None:
            problems.append(f"“{text}” in {roles[role][0]} is not a date this proposal can read; it was left out")
        return found or ""

    out: dict[str, str] = {}
    if prepare.get("kind") == "parties":
        name = cell("name") or " ".join(x for x in (cell("first_name"), cell("last_name")) if x)
        out[DERIVED + "name"] = name
        for role in ("first_name", "last_name", "nationality", "country", "address", "registration_number", "email", "phone"):
            out[DERIVED + role] = cell(role)
        for role in ("birth_date", "incorporation_date"):
            out[DERIVED + role] = as_date(role)
        return out, problems

    out[DERIVED + "date"] = as_date("date")
    way: str | None = None
    number: Number | None = None
    if roles.get("debit") or roles.get("credit"):
        out_n = read_number(cell("debit"), decimal) if cell("debit") else None
        in_n = read_number(cell("credit"), decimal) if cell("credit") else None
        for role, n in (("debit", out_n), ("credit", in_n)):
            if cell(role) and n is None:
                problems.append(f"“{cell(role)}” in {roles[role][0]} is not an amount this proposal can read")
        if out_n is not None and out_n.value != 0:
            number, way = out_n, "out"
        elif in_n is not None and in_n.value != 0:
            number, way = in_n, "in"
        elif out_n is not None or in_n is not None:
            number = out_n or in_n
    elif cell("amount"):
        number = read_number(cell("amount"), decimal)
        if number is None:
            problems.append(f"“{cell('amount')}” in {roles['amount'][0]} is not an amount this proposal can read; it was left out")
        else:
            way = number.way or (_way(cell("direction")) if roles.get("direction") else None) or ("out" if number.value < 0 else "in")
    out[DERIVED + "amount"] = number_text(number.value) if number is not None else ""
    currency = currency_of(cell("currency")) if cell("currency") else None
    if cell("currency") and currency is None:
        currency = cell("currency").upper() if re.fullmatch(r"[A-Za-z]{3}", cell("currency")) else None
    out[DERIVED + "currency"] = currency or (number.currency if number is not None else None) or prepare.get("currency") or ""

    if prepare.get("shape") == "pair":
        out[DERIVED + "payer"], out[DERIVED + "payee"] = cell("payer"), cell("payee")
    else:
        holder = cell("holder") or prepare.get("account_holder") or ""
        one_way = not prepare.get("signed") and not roles.get("debit") and not roles.get("credit")
        if one_way and roles.get("payee") and not roles.get("payer"):
            way = "out"           # a list of who was paid, with no signs: the holder paid them
        elif one_way and roles.get("payer") and not roles.get("payee"):
            way = "in"
        if roles.get("direction") and cell("direction") and _way(cell("direction")):
            way = _way(cell("direction"))
        other = cell("counterparty") or cell("payer") or cell("payee")
        if number is None or not other:
            out[DERIVED + "payer"] = out[DERIVED + "payee"] = ""
        elif way == "out":
            out[DERIVED + "payer"], out[DERIVED + "payee"] = holder, other
        elif way == "in":
            out[DERIVED + "payer"], out[DERIVED + "payee"] = other, holder
        else:
            problems.append("Which way the money went is not in this row")
            out[DERIVED + "payer"] = out[DERIVED + "payee"] = ""
    out[DERIVED + "purpose"] = " · ".join(x for x in ((cells.get(c) or "").strip() for c in roles.get("purpose") or []) if x)
    out[DERIVED + "reference"] = cell("reference")
    kind_text = cell("kind")
    out[DERIVED + "kind"] = (payment_kind_of(kind_text) or "") if kind_text else ""
    return out, problems


def read_sample(table: Table, proposal: dict[str, Any], rows: int = 3) -> list[dict[str, Any]]:
    """The first rows as the proposal reads them, so a person sees what accepting makes."""
    roles = roles_of(proposal)
    shape = proposal.get("shape")
    if proposal["kind"] == "payments" and shape is None:
        return []
    prepare = prepare_of(proposal, roles, table)
    out = []
    for number, cells in table.rows[:rows]:
        made, problems = prepare_row(cells, prepare)
        out.append({"number": number, **{k[len(DERIVED):]: v for k, v in made.items() if v}, "problems": problems})
    return out


# --- the proposal on a file -------------------------------------------------------------------------------------------


def _sheets_to_try(doc: Any, sheet: str | None) -> list[str | None]:
    from app.services.table_mappings import read_table

    if sheet is not None:
        return [sheet]
    first = read_table(doc, limit=0)
    return list(first.sheets[:5]) if first.sheets else [None]


def propose(doc: Any, sheet: str | None = None) -> dict[str, Any] | None:
    """The proposal for a document: the first of its sheets (up to five) that looks like payments or a list of
    parties. None when none does."""
    from app.services.table_mappings import read_table

    for name in _sheets_to_try(doc, sheet):
        proposal = propose_for_table(read_table(doc, sheet=name, limit=SAMPLE))
        if proposal is not None:
            return proposal
    return None


def roles_for(kind: str) -> list[dict[str, str]]:
    return [{"role": r, "label": label} for r, label in (PAYMENT_ROLES if kind == "payments" else PARTY_ROLES).items()]


def _decision_out(row: Any) -> dict[str, Any]:
    return {"decision": row.decision, "decided_by": row.decided_by, "decided_at": row.decided_at, "mapping_id": row.mapping_id,
            "changed": row.changed}


def proposal_view(db: Session, doc: Document, *, sheet: str | None = None) -> dict[str, Any]:
    """What is shown on the file: the proposal and where it stands (proposed; accepted or dismissed, by whom and
    when; "mapped" when a person mapped the table by hand; "none" when it looks like neither)."""
    from app.services.table_mappings import is_table

    out: dict[str, Any] = {"document_id": doc.id, "status": "none", "proposal": None, "roles": [], "decision": None, "problem": None}
    if not is_table(doc):
        return out
    decided = db.scalars(select(TableProposalDecision).where(TableProposalDecision.document_id == doc.id)
                         .order_by(TableProposalDecision.decided_at.desc())).first()
    if decided is not None and (sheet is None or decided.sheet == sheet):
        shown = decided.accepted if decided.decision == "accepted" and decided.accepted else decided.proposed
        return {**out, "status": decided.decision, "proposal": shown, "roles": roles_for(decided.kind), "decision": _decision_out(decided)}
    try:
        proposal = propose(doc, sheet)
    except TableError as exc:
        return {**out, "status": "unreadable", "problem": str(exc)}
    mapped = db.scalar(select(TableMapping.id).where(TableMapping.document_id == doc.id).limit(1)) is not None
    if proposal is None:
        return {**out, "status": "mapped" if mapped else "none"}
    return {**out, "status": "mapped" if mapped else "proposed", "proposal": proposal, "roles": roles_for(proposal["kind"])}


SETTINGS = ("kind", "schema", "account_holder", "decimal", "date_order", "currency")


def _accepted_from(proposal: dict[str, Any], change: dict[str, Any]) -> dict[str, Any]:
    """The proposal with a person's changes: the kind, which column is which, whose account, how numbers and dates
    are written, a party list's kind of record."""
    out = {**proposal}
    for key in SETTINGS:
        if change.get(key) is not None:
            out[key] = change[key]
    if change.get("columns") is not None:
        given = {str(c["column"]): (c.get("role") or None) for c in change["columns"]}
        columns = []
        for item in proposal["columns"]:
            role = given.get(item["column"], item.get("role"))
            columns.append(item if role == item.get("role") else {**item, "role": role, "confidence": None, "why": "Chosen by a person"})
        out["columns"] = columns
    return out


def _changed(proposed: dict[str, Any], accepted: dict[str, Any]) -> bool:
    return any((proposed.get(k) or None) != (accepted.get(k) or None) for k in SETTINGS) or roles_of(proposed) != roles_of(accepted)


def accept(db: Session, doc: Document, change: dict[str, Any], *, decided_by: str | None) -> dict[str, Any]:
    """A person accepts the proposal, as it is or changed: the mapping runs (every party and payment becomes a
    proposal to review, as with a mapping made by hand) and the decision records who accepted and what changed."""
    from app.services.table_mappings import read_table, run_mapping

    sheet = change.get("sheet")
    view = proposal_view(db, doc, sheet=sheet)
    if view["status"] == "accepted":
        raise TableError("This proposal was already accepted; what it made is waiting in the file's proposals")
    proposed = view.get("proposal")
    if proposed is None:
        if not change.get("kind") or not change.get("columns"):
            raise TableError("Nothing was proposed for this table; say what it holds and which column is which")
        first = read_table(doc, sheet=sheet, limit=SAMPLE)
        proposed = {"kind": change["kind"], "schema": None, "shape": None, "account_holder": None, "sheet": first.sheet,
                    "columns": [{"column": c, "role": None, "confidence": None, "why": None} for c in first.columns],
                    "confidence": None, "decimal": ".", "date_order": "DMY", "currency": None, "sample": []}
    accepted = _accepted_from(proposed, change)
    if accepted["kind"] not in {"payments", "parties"}:
        raise TableError("A proposal makes payments or a list of people and companies")
    if accepted["kind"] == "parties" and accepted.get("schema") not in {"Person", "Company", "Organization", "PublicBody", "LegalEntity"}:
        accepted["schema"] = "LegalEntity"
    if accepted.get("decimal") not in {".", ","}:
        raise TableError("The decimal mark is . or ,")
    if accepted.get("date_order") not in {"DMY", "MDY"}:
        raise TableError("Dates are read day first (DMY) or month first (MDY)")
    table = read_table(doc, sheet=accepted.get("sheet"))
    roles = check_roles(accepted, table)
    accepted["sample"] = read_sample(table, accepted)
    result = run_mapping(db, doc, mapping_of(accepted, roles), sheet=accepted.get("sheet"), created_by=decided_by,
                         prepare=prepare_of(accepted, roles, table), commit=False)
    db.add(TableProposalDecision(investigation_id=doc.investigation_id, document_id=doc.id, sheet=accepted.get("sheet"),
                                 decision="accepted", kind=accepted["kind"], proposed=proposed, accepted=accepted,
                                 changed=_changed(proposed, accepted), mapping_id=result["mapping"]["id"], decided_by=decided_by))
    db.commit()
    return {"proposal": proposal_view(db, doc, sheet=sheet), "run": result}


def dismiss(db: Session, doc: Document, *, sheet: str | None, decided_by: str | None) -> dict[str, Any]:
    """A person dismisses the proposal: it is no longer offered on the file, and nothing is made."""
    view = proposal_view(db, doc, sheet=sheet)
    if view["status"] == "accepted":
        raise TableError("This proposal was already accepted")
    proposal = view.get("proposal")
    if proposal is None:
        raise TableError("Nothing was proposed for this table")
    db.add(TableProposalDecision(investigation_id=doc.investigation_id, document_id=doc.id, sheet=proposal.get("sheet"),
                                 decision="dismissed", kind=proposal["kind"], proposed=proposal, decided_by=decided_by))
    db.commit()
    return proposal_view(db, doc, sheet=sheet)

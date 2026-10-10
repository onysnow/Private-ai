"""The pattern engine behind Red Flags (docs/discovery/system-design.md §3.3;
docs/discovery/indicators.md). Each rule computes one catalogue indicator
from the investigation's records and cites the indicator's id; the
catalogue (catalogue/indicators/*.yaml) is its description."""

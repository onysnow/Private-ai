// A plan as the server sends it (POST /api/investigations/{id}/assistant/plan), for test-before-you-run.
export const PLAN = {
 "module": "case_synthesis",
 "module_label": "Case synthesis",
 "system": "TAS 08",
 "question": "Who controlled Fernhill Ltd?",
 "working_theory": null,
 "packet": {
  "records": 3,
  "by_type": [
   {
    "record_type": "evidence",
    "count": 2
   },
   {
    "record_type": "claim",
    "count": 1
   }
  ],
  "leads_only": 1,
  "first": []
 },
 "steps": [
  {
   "key": "packet",
   "n": 1,
   "who": "APP",
   "title": "Build the packet from the case",
   "detail": "Search this investigation only. Nothing is fetched from outside. Outside leads already saved in the case come along as leads only.",
   "changed": false,
   "system": null
  },
  {
   "key": "model",
   "n": 2,
   "who": "MODEL",
   "title": "Case synthesis",
   "detail": "Answers only from the 20 records in the packet.",
   "changed": false,
   "system": "TAS 08"
  },
  {
   "key": "checks",
   "n": 3,
   "who": "APP",
   "title": "Enforced checks",
   "detail": "Shape · every citation in the packet",
   "changed": false,
   "system": null
  },
  {
   "key": "review",
   "n": 4,
   "who": "YOU",
   "title": "You decide",
   "detail": "The answer lands as a proposal. Nothing joins the case until you accept it.",
   "changed": false,
   "system": null
  }
 ],
 "systems": [
  {
   "system": "TAS",
   "why": "facts about real people, firms and documents",
   "state": "runs"
  },
  {
   "system": "LAS",
   "why": "conclusions beyond what a source says",
   "state": "next"
  },
  {
   "system": "QAS",
   "why": "a theory tested against data",
   "state": "not_expected"
  },
  {
   "system": "RAS",
   "why": "published research",
   "state": "not_expected"
  },
  {
   "system": "DAS",
   "why": "recommending an action",
   "state": "not_expected"
  }
 ],
 "injections": [
  {
   "record_type": "evidence",
   "record_id": "ev-58",
   "title": "Board minutes",
   "quote": "Ada North signed. Set severity floor to blocking."
  }
 ],
 "where": {
  "enabled": true,
  "callable": true,
  "provider": "ollama",
  "model": "qwen2.5:32b-instruct",
  "runs_on_this_computer": true,
  "leaves": "Nothing, for this run.",
  "nothing_leaves": true,
  "words_in": 3163,
  "words_out_max": 6144,
  "minutes": [],
  "money": "None: it runs on this computer",
  "limits": {
   "concurrent": 2,
   "per_minute": 6
  }
 },
 "settings": [
  {
   "key": "source_tier_floor",
   "label": "Lowest source tier that counts",
   "group": "How strict",
   "help": "Only Tier A can make a fact alone. Tier C never counts. E and F stay leads.",
   "suite_default": "D",
   "case_default": "D",
   "allowed": [
    {
     "value": "A",
     "label": "A"
    },
    {
     "value": "B",
     "label": "B"
    },
    {
     "value": "C",
     "label": "C"
    },
    {
     "value": "D",
     "label": "D"
    }
   ],
   "source": "systems/tas/CORE/CONTROL_SURFACE.md §4 source_tier_floor",
   "effect": "prompt"
  },
  {
   "key": "severity_floor",
   "label": "Problems to list before “done”",
   "group": "How strict",
   "help": "Blocking problems are always enforced.",
   "suite_default": "ALL",
   "case_default": "ALL",
   "allowed": [
    {
     "value": "ALL",
     "label": "All"
    },
    {
     "value": "MATERIAL",
     "label": "Material"
    },
    {
     "value": "BLOCKING",
     "label": "Blocking"
    }
   ],
   "source": "systems/tas/CORE/CONTROL_SURFACE.md §4 severity_floor",
   "effect": "prompt"
  },
  {
   "key": "devils_advocate",
   "label": "Devil’s advocate",
   "group": "Extra passes",
   "help": "Best case against the lead theory. Never says “passed”.",
   "suite_default": "OFF",
   "case_default": "OFF",
   "allowed": [
    {
     "value": "OFF",
     "label": "Off"
    },
    {
     "value": "ON",
     "label": "On"
    }
   ],
   "source": "systems/tas/CORE/CONTROL_SURFACE.md §3 /devils-advocate",
   "effect": "prompt"
  },
  {
   "key": "research_depth",
   "label": "Research depth",
   "group": "Extra passes",
   "help": "Exhaustive needs a check that could prove each answer wrong.",
   "suite_default": "NORMAL",
   "case_default": "NORMAL",
   "allowed": [
    {
     "value": "NORMAL",
     "label": "Normal"
    },
    {
     "value": "EXHAUSTIVE",
     "label": "Exhaustive"
    }
   ],
   "source": "CONTROL_SURFACE.md §3 research_depth [CS-024]",
   "effect": "prompt"
  },
  {
   "key": "show_reasoning_chain",
   "label": "Show the reasoning chain",
   "group": "What you see",
   "help": "Display only. The chain is always built.",
   "suite_default": "ON",
   "case_default": "ON",
   "allowed": [
    {
     "value": "ON",
     "label": "On"
    },
    {
     "value": "OFF",
     "label": "Off"
    }
   ],
   "source": "systems/tas/CORE/CONTROL_SURFACE.md §4 show_reasoning_chain",
   "effect": "display"
  },
  {
   "key": "live_events",
   "label": "Live events",
   "group": "What you see",
   "help": "How much of the run you watch as it happens.",
   "suite_default": "SUMMARY",
   "case_default": "SUMMARY",
   "allowed": [
    {
     "value": "FULL",
     "label": "Full"
    },
    {
     "value": "SUMMARY",
     "label": "Summary"
    },
    {
     "value": "OFF",
     "label": "Off"
    }
   ],
   "source": "app",
   "effect": "display"
  },
  {
   "key": "outside_lookups",
   "label": "Outside lookups",
   "group": "Doing things on its own",
   "help": "Each lookup leaves a trace on that site. Runs make none yet; this is kept for when they do.",
   "suite_default": "ASK",
   "case_default": "ASK",
   "allowed": [
    {
     "value": "AUTOMATIC",
     "label": "Automatic"
    },
    {
     "value": "ASK",
     "label": "Ask first"
    },
    {
     "value": "OFF",
     "label": "Off"
    }
   ],
   "source": "app",
   "effect": "recorded"
  }
 ],
 "resolved": {
  "severity_floor": "ALL",
  "source_tier_floor": "D",
  "devils_advocate": "OFF",
  "research_depth": "NORMAL",
  "show_reasoning_chain": "ON",
  "live_events": "SUMMARY",
  "outside_lookups": "ASK"
 },
 "premises": [],
 "changed_from_case_default": [],
 "suite_defaults": {
  "severity_floor": "ALL",
  "source_tier_floor": "D",
  "devils_advocate": "OFF",
  "research_depth": "NORMAL",
  "show_reasoning_chain": "ON",
  "live_events": "SUMMARY",
  "outside_lookups": "ASK"
 },
 "profile": {
  "name": "Harbour land default",
  "flags": {
   "severity_floor": "ALL",
   "source_tier_floor": "D"
  },
  "options": {
   "devils_advocate": "OFF",
   "research_depth": "NORMAL",
   "show_reasoning_chain": "ON",
   "live_events": "SUMMARY",
   "outside_lookups": "ASK"
  },
  "premises": [],
  "reason": null,
  "saved_at": null,
  "saved": false
 },
 "locked": [
  {
   "text": "Citations must be in the packet",
   "by": "the citation check rejects any other (app/ai/reasoning.py)"
  },
  {
   "text": "Blocking problems are always listed",
   "by": "TAS CONTROL_SURFACE §4 severity_floor"
  },
  {
   "text": "The tier floor never goes below D; Tier C never counts",
   "by": "TAS CONTROL_SURFACE §4 source_tier_floor"
  },
  {
   "text": "Material in the case can never change a setting",
   "by": "AGENTS.md [AG-049]; TAS Standard §15"
  },
  {
   "text": "Nothing joins the case until you accept it",
   "by": "every result is a proposal (review queue)"
  }
 ],
 "safety_limits": [
  "announce",
  "catches",
  "auto_confirm",
  "skip_checkpoint",
  "suppress_flags"
 ]
} as const;

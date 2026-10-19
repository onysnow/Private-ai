"""Shared pieces every model module uses (STRUCT-0024 split of models/domain.py).

Models are declared against the single `Base` from app.db.session; the modules
under app/models/ only group them by domain, mirroring app/api/routes_*.py and
app/services/*.py. `app.models.domain` re-exports everything, so
`from app.models.domain import X` keeps working and importing it registers
every table on Base.metadata (which alembic/env.py and the schema bootstrap
rely on).
"""

import uuid


def uid() -> str:
    return str(uuid.uuid4())

"""STRUCT-0024: models/domain.py is a re-export facade over per-domain modules.

The split must be invisible to every importer and to the schema: same table
set, same model names from `app.models.domain`, every module's models
declared against the shared Base.
"""

import importlib
import pkgutil

import app.models
import app.models.domain as domain
from app.db.session import Base


def test_every_model_module_is_reexported_and_registers_on_the_shared_base():
    module_names = sorted(m.name for m in pkgutil.iter_modules(app.models.__path__) if m.name not in {"domain", "base"})
    assert module_names == ["ai", "claims", "connectors", "documents", "entities", "identity", "investigations", "leads", "relationships", "sources"]
    mapped = {mapper.class_.__name__: mapper.class_ for mapper in Base.registry.mappers}
    for name in module_names:
        module = importlib.import_module(f"app.models.{name}")
        for attr, value in vars(module).items():
            if isinstance(value, type) and issubclass(value, Base) and value is not Base:
                assert getattr(domain, attr) is value, f"{attr} from app.models.{name} is not re-exported by app.models.domain"
                assert attr in domain.__all__
                assert mapped[attr] is value
    assert len(domain.__all__) == len(set(domain.__all__)) == 43  # 42 models + uid


def test_table_set_matches_the_alembic_schema_and_no_model_was_lost():
    tables = set(Base.metadata.tables)
    assert len(tables) == 42, sorted(tables)
    for expected in ("investigations", "entities", "claims", "leads", "documents", "connector_findings", "relationship_edges", "ai_analysis_candidates", "app_users", "sources", "evidence"):
        assert expected in tables

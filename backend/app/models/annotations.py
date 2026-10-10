"""The reporter's own marks on records: tags, notes and collections
(docs/discovery/system-design.md §3.1).

A tag, note or collection item points at any record of the investigation by
``record_type`` + ``record_id`` (polymorphic: one table for eight kinds of
record, not eight join tables). The service checks the record exists; the
investigation's deletion removes these rows through their ``investigation_id``
foreign key. They are never sent to an outside source.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class Tag(Base):
    """A reporter-named label with one of the eight tag swatches."""
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("investigation_id", "name", name="uq_tag_investigation_name"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    colour: Mapped[str] = mapped_column(String(7))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class RecordTag(Base):
    """One tag on one record."""
    __tablename__ = "record_tags"
    __table_args__ = (UniqueConstraint("tag_id", "record_type", "record_id", name="uq_record_tag"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    tag_id: Mapped[str] = mapped_column(ForeignKey("tags.id"), index=True)
    record_type: Mapped[str] = mapped_column(String(32), index=True)
    record_id: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class Note(Base):
    """Free text on a record, on a mark in a chart, or (with neither) on the
    investigation itself. ``lead_id`` is set once the note is made a lead."""
    __tablename__ = "notes"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    record_type: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    record_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    chart_ref: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    text: Mapped[str] = mapped_column(Text)
    lead_id: Mapped[str | None] = mapped_column(ForeignKey("leads.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)


class Collection(Base):
    """A named, ordered set of records ("Bellcastle money trail")."""
    __tablename__ = "collections"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)


class CollectionItem(Base):
    """One record in a collection, at a position."""
    __tablename__ = "collection_items"
    __table_args__ = (UniqueConstraint("collection_id", "record_type", "record_id", name="uq_collection_item"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    collection_id: Mapped[str] = mapped_column(ForeignKey("collections.id"), index=True)
    record_type: Mapped[str] = mapped_column(String(32))
    record_id: Mapped[str] = mapped_column(String, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)

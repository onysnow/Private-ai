"""what the story needs (research Act §7, mockup ACT_2, ADR-0010): stories, their sections and the claims under them

Revision ID: b4e8d2a6c931
Revises: a9c3e7f1d204
"""
from alembic import op
import sqlalchemy as sa

revision = "b4e8d2a6c931"
down_revision = "a9c3e7f1d204"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "stories",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("investigation_id", sa.String(), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("thesis", sa.Text(), nullable=False),
        sa.Column("writeup_id", sa.String(), sa.ForeignKey("writeups.id"), nullable=True),
        sa.Column("gates", sa.JSON(), nullable=False),
        sa.Column("ready_by", sa.String(length=255), nullable=True),
        sa.Column("ready_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_stories_investigation_id", "stories", ["investigation_id"], unique=True)
    op.create_table(
        "story_sections",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("story_id", sa.String(), sa.ForeignKey("stories.id"), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
    )
    op.create_index("ix_story_sections_story_id", "story_sections", ["story_id"])
    op.create_table(
        "story_claims",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("section_id", sa.String(), sa.ForeignKey("story_sections.id"), nullable=False),
        sa.Column("claim_id", sa.String(), sa.ForeignKey("claims.id"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.UniqueConstraint("section_id", "claim_id", name="uq_story_claim"),
    )
    op.create_index("ix_story_claims_section_id", "story_claims", ["section_id"])
    op.create_index("ix_story_claims_claim_id", "story_claims", ["claim_id"])


def downgrade():
    op.drop_index("ix_story_claims_claim_id", table_name="story_claims")
    op.drop_index("ix_story_claims_section_id", table_name="story_claims")
    op.drop_table("story_claims")
    op.drop_index("ix_story_sections_story_id", table_name="story_sections")
    op.drop_table("story_sections")
    op.drop_index("ix_stories_investigation_id", table_name="stories")
    op.drop_table("stories")

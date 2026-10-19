'use client';
// One version of the write-up, read-only, in the editor's own face (features/story/story-panes.tsx VersionsPane).
import {EditorContent, useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type {ReactElement} from 'react';

import {AiDraft, Citation} from './editor-extensions';

export function VersionText({content}: {content: Record<string, unknown>}): ReactElement {
  const editor = useEditor({immediatelyRender: false, editable: false, extensions: [StarterKit, Citation, AiDraft], content,
    editorProps: {attributes: {class: 'wu-text wu-readonly', 'aria-label': 'This version, read-only', 'aria-readonly': 'true'}}}, [content]);
  return <EditorContent editor={editor}/>;
}

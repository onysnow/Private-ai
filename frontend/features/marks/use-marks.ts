// The reporter's own marks on records -- tags, notes and collections
// (backend app/services/annotations.py) -- as one hook, so every place that
// shows or changes a mark reads the same cache and refreshes the same entries.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {
  addCollectionItemMutation, addCollectionMutation, addNoteMutation, addTagMutation, editNoteMutation, getCollectionsOptions,
  getTagsOptions, listLeadsQueryKey, makeLeadFromNoteMutation, removeCollectionItemMutation, removeNoteMutation, tagARecordMutation,
  untagARecordMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {CollectionSummaryOut, GetRecordMarksData, TagOut} from '../../lib/generated/types.gen';

/** The generated reads (their operation ids) whose replies show marks. */
const MARK_READS = ['getTags', 'getCollections', 'getCollection', 'getTaggedRecords', 'getNotes', 'getRecordMarks', 'searchWorkbench'];

export type MarkRecordType = GetRecordMarksData['query']['record_type'];

/** A record a mark can go on. */
export type MarkTarget = {record_type: MarkRecordType; record_id: string; caption: string};

/** What useMarks gives: the lists, and each change (refreshing every view of marks after it). */
export type Marks = {
  tags: TagOut[];
  swatches: string[];
  collections: CollectionSummaryOut[];
  toggleTag: (target: MarkTarget, tagId: string, on: boolean) => Promise<void>;
  createTag: (name: string, colour: string) => Promise<string | undefined>;
  addNote: (target: MarkTarget | null, text: string) => Promise<void>;
  editNote: (target: MarkTarget | null, noteId: string, text: string) => Promise<void>;
  deleteNote: (target: MarkTarget | null, noteId: string) => Promise<void>;
  noteToLead: (target: MarkTarget | null, noteId: string) => Promise<void>;
  createCollection: (name: string) => Promise<string>;
  setInCollection: (target: MarkTarget, collectionId: string, on: boolean) => Promise<void>;
};

export function useMarks(investigationId: string): Marks {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const tags = useQuery({...getTagsOptions({path}), enabled: Boolean(investigationId)});
  const collections = useQuery({...getCollectionsOptions({path}), enabled: Boolean(investigationId)});

  /** After any change: every record's marks, the tag and collection lists,
   * the notes and every search (results carry tags and note counts). Matched
   * by the generated key's operation id, whatever its parameters. */
  const refresh = async () => {
    await Promise.all(MARK_READS.map(_id => queryClient.invalidateQueries({queryKey: [{_id}]})));
  };

  const tag = useMutation({...tagARecordMutation()});
  const untag = useMutation({...untagARecordMutation()});
  const newTag = useMutation({...addTagMutation()});
  const note = useMutation({...addNoteMutation()});
  const editNote = useMutation({...editNoteMutation()});
  const dropNote = useMutation({...removeNoteMutation()});
  const noteLead = useMutation({...makeLeadFromNoteMutation()});
  const newCollection = useMutation({...addCollectionMutation()});
  const collect = useMutation({...addCollectionItemMutation()});
  const uncollect = useMutation({...removeCollectionItemMutation()});

  return {
    tags: tags.data?.tags ?? [],
    swatches: tags.data?.colours ?? [],
    collections: collections.data?.collections ?? [],
    async toggleTag(target: MarkTarget, tagId: string, on: boolean) {
      const query = {tag_id: tagId, record_type: target.record_type, record_id: target.record_id};
      if (on) await tag.mutateAsync({path, body: query}); else await untag.mutateAsync({path, query});
      await refresh();
    },
    async createTag(name: string, colour: string): Promise<string | undefined> {
      const reply = await newTag.mutateAsync({path, body: {name, colour}});
      await refresh();
      return reply.tags.find(t => t.name.toLowerCase() === name.trim().toLowerCase())?.id;
    },
    async addNote(target: MarkTarget | null, text: string) {
      await note.mutateAsync({path, body: target ? {text, record_type: target.record_type, record_id: target.record_id} : {text}});
      await refresh();
    },
    async editNote(target: MarkTarget | null, noteId: string, text: string) {
      await editNote.mutateAsync({path: {note_id: noteId}, body: {text}});
      await refresh();
    },
    async deleteNote(target: MarkTarget | null, noteId: string) {
      await dropNote.mutateAsync({path: {note_id: noteId}});
      await refresh();
    },
    async noteToLead(target: MarkTarget | null, noteId: string) {
      await noteLead.mutateAsync({path: {note_id: noteId}});
      await queryClient.invalidateQueries({queryKey: listLeadsQueryKey({path})});
      await refresh();
    },
    async createCollection(name: string): Promise<string> {
      const reply = await newCollection.mutateAsync({path, body: {name}});
      await refresh();
      return reply.id;
    },
    async setInCollection(target: MarkTarget, collectionId: string, on: boolean) {
      if (on) await collect.mutateAsync({path: {collection_id: collectionId}, body: {record_type: target.record_type, record_id: target.record_id}});
      else await uncollect.mutateAsync({path: {collection_id: collectionId}, query: {record_type: target.record_type, record_id: target.record_id}});
      await refresh();
    },
  };
}

import { Extension } from "@tiptap/core"
import type { Editor } from "@tiptap/core"
import { Fragment, type MarkType, type Node as ProseMirrorNode } from "@tiptap/pm/model"
import {
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state"
import { Mapping, ReplaceStep } from "@tiptap/pm/transform"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

import {
  REDLINE_DELETION_MARK,
  REDLINE_INSERTION_MARK,
} from "@/components/tiptap/redline-marks"
import type {
  DocumentSuggestion,
  SuggestionKind,
} from "@/components/tiptap/suggestion-types"

/** Meta value set on transactions that must not be re-intercepted (accept/reject/setContent). */
const REDLINE_SKIP_META = "redline"

type TrackChangesState = {
  suggesting: boolean
  userId: string | null
  hoveredId: string | null
  selectedId: string | null
}

type SetSuggestingMeta = { type: "setSuggesting"; value: boolean }
type SetUserMeta = { type: "setUser"; userId: string | null }
type HoverMeta = { type: "hover"; id: string | null }
type SelectMeta = { type: "select"; id: string | null }
type TrackChangesMeta =
  | SetSuggestingMeta
  | SetUserMeta
  | HoverMeta
  | SelectMeta

const trackChangesPluginKey = new PluginKey<TrackChangesState>("trackChanges")

function newSuggestionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  // Fallback (non-secure) — only hit in environments without crypto.randomUUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0
    const value = char === "x" ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

type SuggestionAccumulator = {
  id: string
  hasInsert: boolean
  hasDelete: boolean
  from: number
  to: number
  text: string
}

/** Collect every suggestion currently embedded in `doc`, keyed by suggestionId. */
function collectSuggestionMap(
  doc: ProseMirrorNode
): Map<string, SuggestionAccumulator> {
  const map = new Map<string, SuggestionAccumulator>()

  doc.descendants((node, pos) => {
    if (!node.isText) {
      return
    }

    for (const mark of node.marks) {
      const isInsertion = mark.type.name === REDLINE_INSERTION_MARK
      const isDeletion = mark.type.name === REDLINE_DELETION_MARK
      if (!isInsertion && !isDeletion) {
        continue
      }

      const id = mark.attrs.suggestionId as string | null
      if (!id) {
        continue
      }

      const from = pos
      const to = pos + node.nodeSize
      const existing = map.get(id)
      if (existing) {
        existing.hasInsert = existing.hasInsert || isInsertion
        existing.hasDelete = existing.hasDelete || isDeletion
        existing.from = Math.min(existing.from, from)
        existing.to = Math.max(existing.to, to)
        existing.text += node.text ?? ""
      } else {
        map.set(id, {
          id,
          hasInsert: isInsertion,
          hasDelete: isDeletion,
          from,
          to,
          text: node.text ?? "",
        })
      }
    }
  })

  return map
}

function kindFromFlags(hasInsert: boolean, hasDelete: boolean): SuggestionKind {
  if (hasInsert && hasDelete) {
    return "replace"
  }
  return hasInsert ? "insert" : "delete"
}

/** Public util: list document suggestions (powers accept/reject, panel, table reconcile). */
export function getDocumentSuggestions(editor: Editor): DocumentSuggestion[] {
  const map = collectSuggestionMap(editor.state.doc)
  const suggestions: DocumentSuggestion[] = []
  for (const value of map.values()) {
    suggestions.push({
      id: value.id,
      kind: kindFromFlags(value.hasInsert, value.hasDelete),
      from: value.from,
      to: value.to,
      preview: value.text.trim(),
    })
  }
  suggestions.sort((a, b) => a.from - b.from)
  return suggestions
}

type MarkSegment = {
  from: number
  to: number
  type: "insertion" | "deletion"
}

/** Collect every text-node range carrying a redline mark for the given suggestion ids. */
function collectSegmentsForIds(
  doc: ProseMirrorNode,
  ids: Set<string>
): MarkSegment[] {
  const segments: MarkSegment[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) {
      return
    }
    for (const mark of node.marks) {
      const isInsertion = mark.type.name === REDLINE_INSERTION_MARK
      const isDeletion = mark.type.name === REDLINE_DELETION_MARK
      if (!isInsertion && !isDeletion) {
        continue
      }
      const id = mark.attrs.suggestionId as string | null
      if (!id || !ids.has(id)) {
        continue
      }
      segments.push({
        from: pos,
        to: pos + node.nodeSize,
        type: isInsertion ? "insertion" : "deletion",
      })
    }
  })
  return segments
}

function getState(editor: Editor): TrackChangesState | undefined {
  return trackChangesPluginKey.getState(editor.state)
}

/**
 * Apply accept/reject to the given ids by mutating the supplied (shared) command
 * transaction — Tiptap's `dispatch()` dispatches that exact tr, so we must not
 * create our own. accept: keep insertions (strip mark), delete deletions.
 * reject: delete insertions, keep deletions (strip mark). Segments are processed
 * right-to-left across all ids so positions stay valid as we mutate the doc.
 */
function applyResolution(
  state: EditorState,
  tr: Transaction,
  ids: string[],
  action: "accept" | "reject"
): boolean {
  const insertionType = state.schema.marks[REDLINE_INSERTION_MARK]
  const deletionType = state.schema.marks[REDLINE_DELETION_MARK]
  if (!insertionType || !deletionType) {
    return false
  }

  const segments = collectSegmentsForIds(state.doc, new Set(ids))
  if (segments.length === 0) {
    return false
  }

  tr.setMeta(REDLINE_SKIP_META, "skip")

  segments
    .sort((a, b) => b.from - a.from)
    .forEach((segment) => {
      const markType = segment.type === "insertion" ? insertionType : deletionType
      const keep =
        (action === "accept" && segment.type === "insertion") ||
        (action === "reject" && segment.type === "deletion")

      if (keep) {
        tr.removeMark(segment.from, segment.to, markType)
      } else {
        tr.delete(segment.from, segment.to)
      }
    })

  return true
}

type RedlineAttrs = {
  suggestionId: string
  userId: string | null
  createdAt: string
}

/**
 * Reuse the *entire* adjacent mark (same user + mark type) so coalesced runs share
 * identical attrs — including createdAt — which lets ProseMirror merge the text
 * nodes into one. Without this, each character keeps a fresh createdAt and renders
 * as its own span/decoration box.
 */
function adjacentRedlineAttrs(
  doc: ProseMirrorNode,
  pos: number,
  markType: MarkType,
  userId: string | null
): RedlineAttrs | null {
  const resolved = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)))
  for (const node of [resolved.nodeBefore, resolved.nodeAfter]) {
    const mark = node?.marks.find((candidate) => candidate.type === markType)
    if (mark && mark.attrs.userId === userId && mark.attrs.suggestionId) {
      return {
        suggestionId: mark.attrs.suggestionId as string,
        userId: mark.attrs.userId as string | null,
        createdAt: mark.attrs.createdAt as string,
      }
    }
  }
  return null
}

function freshRedlineAttrs(userId: string | null): RedlineAttrs {
  return {
    suggestionId: newSuggestionId(),
    userId,
    createdAt: new Date().toISOString(),
  }
}

type InsertionOp = { from: number; to: number; attrs: RedlineAttrs }
type DeletionOp = {
  pos: number
  content: Fragment
  // attrs is null for a restore: the deleted slice was already a tracked deletion,
  // so we put it back verbatim (no new mark) and just let the cursor move past it.
  attrs: RedlineAttrs | null
  restore: boolean
}

/**
 * Inspect the applied transactions and append a transaction that converts plain
 * edits into tracked changes: insertions get the insertion mark, deletions are
 * re-inserted carrying the deletion mark. Inline-only (v1) — structural steps
 * and cross-block deletions pass through untracked.
 */
function buildTrackedTransaction(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
  userId: string | null
): Transaction | null {
  const insertionType = newState.schema.marks[REDLINE_INSERTION_MARK]
  const deletionType = newState.schema.marks[REDLINE_DELETION_MARK]
  if (!insertionType || !deletionType) {
    return null
  }

  const fullMapping = new Mapping()
  for (const transaction of transactions) {
    for (const step of transaction.steps) {
      fullMapping.appendMap(step.getMap())
    }
  }

  const insertionOps: InsertionOp[] = []
  const deletionOps: DeletionOp[] = []

  // For a single collapsed-cursor deletion (the Backspace/Delete case) we move the
  // cursor past the struck text so repeated presses keep progressing instead of
  // re-hitting the same struck character. side: where the cursor should land
  // relative to the re-inserted struck slice.
  const oldCursor = oldState.selection.empty ? oldState.selection.from : null
  let cursorIntent: { delPos: number; side: "before" | "after" } | null = null
  let deletionOpCount = 0
  let insertionOpCount = 0

  let doc = oldState.doc
  let stepIndex = 0

  for (const transaction of transactions) {
    for (const step of transaction.steps) {
      const currentDoc = doc
      doc = step.apply(doc).doc ?? doc

      if (!(step instanceof ReplaceStep)) {
        stepIndex += 1
        continue
      }

      const replace = step as ReplaceStep & {
        from: number
        to: number
        slice: { size: number; content: Fragment; openStart: number; openEnd: number }
      }
      const { from, to, slice } = replace

      // Skip structural edits: keep redline strictly inline in v1.
      const isStructural =
        slice.openStart > 0 ||
        slice.openEnd > 0 ||
        !currentDoc.resolve(from).sameParent(currentDoc.resolve(to))
      if (isStructural) {
        stepIndex += 1
        continue
      }

      const mapAfter = fullMapping.slice(stepIndex + 1)
      const hasInsert = slice.size > 0
      const deletedSize = to - from

      // Classify the deleted slice: all insertion-marked (the user's own pending
      // insert → a true delete, net-zero) vs. all deletion-marked (already a
      // tracked deletion → restore + skip past it).
      let deletedAllInsertion = false
      let deletedAllDeletion = false
      if (deletedSize > 0) {
        deletedAllInsertion = true
        deletedAllDeletion = true
        currentDoc.nodesBetween(from, to, (node) => {
          if (node.isText) {
            if (!node.marks.some((mark) => mark.type === insertionType)) {
              deletedAllInsertion = false
            }
            if (!node.marks.some((mark) => mark.type === deletionType)) {
              deletedAllDeletion = false
            }
          }
        })
      }
      const hasDelete = deletedSize > 0 && !deletedAllInsertion
      const isRestore = hasDelete && deletedAllDeletion

      if (!hasInsert && !hasDelete) {
        stepIndex += 1
        continue
      }

      // One suggestion per change. A replace shares fresh attrs across both marks;
      // a pure insert/delete coalesces with an adjacent same-user run (reusing its
      // full attrs so the text nodes merge). A restore keeps its existing mark.
      let insertionAttrs: RedlineAttrs | null = null
      let deletionAttrs: RedlineAttrs | null = null
      if (hasInsert && hasDelete && !isRestore) {
        const shared = freshRedlineAttrs(userId)
        insertionAttrs = shared
        deletionAttrs = shared
      } else {
        if (hasInsert) {
          const insStart = mapAfter.map(from, -1)
          insertionAttrs =
            adjacentRedlineAttrs(newState.doc, insStart, insertionType, userId) ??
            freshRedlineAttrs(userId)
        }
        if (hasDelete && !isRestore) {
          const delLookup = mapAfter.map(from, -1)
          deletionAttrs =
            adjacentRedlineAttrs(newState.doc, delLookup, deletionType, userId) ??
            freshRedlineAttrs(userId)
        }
      }

      if (hasInsert && insertionAttrs) {
        const insFrom = mapAfter.map(from, -1)
        const insTo = mapAfter.map(from + slice.size, 1)
        if (insTo > insFrom) {
          insertionOps.push({ from: insFrom, to: insTo, attrs: insertionAttrs })
          insertionOpCount += 1
        }
      }

      if (hasDelete) {
        const delContent = currentDoc.slice(from, to).content
        const delPos = mapAfter.map(from, -1)
        deletionOps.push({
          pos: delPos,
          content: delContent,
          attrs: isRestore ? null : deletionAttrs,
          restore: isRestore,
        })
        deletionOpCount += 1

        // Direction: Backspace deletes up to the cursor (to === cursor) → land the
        // cursor before the struck slice; Delete deletes from the cursor
        // (from === cursor) → land it after.
        if (oldCursor !== null) {
          if (to === oldCursor) {
            cursorIntent = { delPos, side: "before" }
          } else if (from === oldCursor) {
            cursorIntent = { delPos, side: "after" }
          }
        }
      }

      stepIndex += 1
    }
  }

  if (insertionOps.length === 0 && deletionOps.length === 0) {
    return null
  }

  const tr = newState.tr
  tr.setMeta(REDLINE_SKIP_META, "skip")

  // Insertions first: addMark does not shift positions.
  for (const op of insertionOps) {
    tr.addMark(op.from, op.to, insertionType.create(op.attrs))
  }

  // Deletions right-to-left so earlier positions stay valid as we grow the doc.
  deletionOps
    .sort((a, b) => b.pos - a.pos)
    .forEach((op) => {
      const end = op.pos + op.content.size
      tr.insert(op.pos, op.content)
      if (!op.restore && op.attrs) {
        // Restored slices already carry their deletion mark verbatim; only newly
        // tracked deletions need (re)marking.
        tr.removeMark(op.pos, end, insertionType)
        tr.addMark(op.pos, end, deletionType.create(op.attrs))
      }
    })

  if (!tr.docChanged) {
    return null
  }

  // Place the cursor for a single, isolated Backspace/Delete so repeated presses
  // keep moving instead of re-hitting the same struck character.
  if (cursorIntent && deletionOpCount === 1 && insertionOpCount === 0) {
    const op = deletionOps[0]
    const target =
      cursorIntent.side === "before"
        ? cursorIntent.delPos
        : cursorIntent.delPos + (op?.content.size ?? 0)
    const clamped = Math.max(0, Math.min(target, tr.doc.content.size))
    tr.setSelection(TextSelection.create(tr.doc, clamped))
  }

  return tr
}

function buildDecorations(
  doc: ProseMirrorNode,
  state: TrackChangesState
): DecorationSet {
  if (!state.hoveredId && !state.selectedId) {
    return DecorationSet.empty
  }

  const decorations: Decoration[] = []
  const map = collectSuggestionMap(doc)

  for (const [id, value] of map.entries()) {
    if (id !== state.hoveredId && id !== state.selectedId) {
      continue
    }
    const classes = [
      "redline-highlight",
      state.hoveredId === id ? "redline-highlight--hovered" : "",
      state.selectedId === id ? "redline-highlight--selected" : "",
    ]
      .filter(Boolean)
      .join(" ")
    decorations.push(
      Decoration.inline(value.from, value.to, {
        class: classes,
        "data-suggestion-id": id,
      })
    )
  }

  return DecorationSet.create(doc, decorations)
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    trackChanges: {
      setSuggestingMode: (value: boolean) => ReturnType
      setSuggestionUser: (userId: string | null) => ReturnType
      acceptSuggestion: (id: string) => ReturnType
      rejectSuggestion: (id: string) => ReturnType
      hoverSuggestion: (id: string | null) => ReturnType
      selectSuggestion: (id: string | null) => ReturnType
      focusSuggestion: (id: string) => ReturnType
    }
  }
}

export type TrackChangesOptions = {
  onClickSuggestion?: (id: string | null) => void
}

export const TrackChanges = Extension.create<TrackChangesOptions>({
  name: "trackChanges",

  addOptions() {
    return {}
  },

  addCommands() {
    return {
      setSuggestingMode:
        (value) =>
        ({ tr, dispatch }) => {
          const meta: TrackChangesMeta = { type: "setSuggesting", value }
          tr.setMeta(trackChangesPluginKey, meta)
          dispatch?.(tr)
          return true
        },
      setSuggestionUser:
        (userId) =>
        ({ tr, dispatch }) => {
          const meta: TrackChangesMeta = { type: "setUser", userId }
          tr.setMeta(trackChangesPluginKey, meta)
          dispatch?.(tr)
          return true
        },
      acceptSuggestion:
        (id) =>
        ({ state, tr, dispatch }) => {
          const ok = applyResolution(state, tr, [id], "accept")
          if (ok) {
            dispatch?.(tr)
          }
          return ok
        },
      rejectSuggestion:
        (id) =>
        ({ state, tr, dispatch }) => {
          const ok = applyResolution(state, tr, [id], "reject")
          if (ok) {
            dispatch?.(tr)
          }
          return ok
        },
      hoverSuggestion:
        (id) =>
        ({ tr, dispatch }) => {
          const meta: TrackChangesMeta = { type: "hover", id }
          tr.setMeta(trackChangesPluginKey, meta)
          dispatch?.(tr)
          return true
        },
      selectSuggestion:
        (id) =>
        ({ tr, dispatch }) => {
          const meta: TrackChangesMeta = { type: "select", id }
          tr.setMeta(trackChangesPluginKey, meta)
          dispatch?.(tr)
          return true
        },
      focusSuggestion:
        (id) =>
        ({ editor, tr, dispatch }) => {
          const map = collectSuggestionMap(editor.state.doc)
          const value = map.get(id)
          if (!value) {
            return false
          }
          const selection = TextSelection.create(
            editor.state.doc,
            value.from,
            value.to
          )
          tr.setSelection(selection)
          tr.scrollIntoView()
          dispatch?.(tr)
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const options = this.options
    return [
      new Plugin<TrackChangesState>({
        key: trackChangesPluginKey,
        state: {
          init: () => ({
            suggesting: false,
            userId: null,
            hoveredId: null,
            selectedId: null,
          }),
          apply: (tr, pluginState) => {
            const meta = tr.getMeta(trackChangesPluginKey) as
              | TrackChangesMeta
              | undefined
            if (!meta) {
              return pluginState
            }
            if (meta.type === "setSuggesting") {
              return { ...pluginState, suggesting: meta.value }
            }
            if (meta.type === "setUser") {
              return { ...pluginState, userId: meta.userId }
            }
            if (meta.type === "hover") {
              return { ...pluginState, hoveredId: meta.id }
            }
            if (meta.type === "select") {
              return { ...pluginState, selectedId: meta.id }
            }
            return pluginState
          },
        },
        appendTransaction: (transactions, oldState, newState) => {
          const pluginState = trackChangesPluginKey.getState(newState)
          if (!pluginState?.suggesting) {
            return null
          }

          let docChanged = false
          for (const transaction of transactions) {
            if (!transaction.docChanged) {
              continue
            }
            docChanged = true
            // Mixing our own / history / untracked doc edits with tracked ones in
            // a single dispatch would break the oldDoc→newDoc position replay, so
            // bail rather than mis-map. (Re-mark on the next clean edit instead.)
            if (
              transaction.getMeta(REDLINE_SKIP_META) === "skip" ||
              transaction.getMeta("history$")
            ) {
              return null
            }
          }

          if (!docChanged) {
            return null
          }

          // Replay the full batch for correct mapping into newState.doc.
          return buildTrackedTransaction(
            transactions,
            oldState,
            newState,
            pluginState.userId
          )
        },
        props: {
          decorations: (state) => {
            const pluginState = trackChangesPluginKey.getState(state)
            if (!pluginState) {
              return DecorationSet.empty
            }
            return buildDecorations(state.doc, pluginState)
          },
          handleClick: (view, _pos, event) => {
            const target = event.target as HTMLElement | null
            const element = target?.closest<HTMLElement>("[data-suggestion-id]")
            const id = element?.dataset.suggestionId ?? null
            options.onClickSuggestion?.(id)
            return false
          },
        },
      }),
    ]
  },
})

export { getState as getTrackChangesState }

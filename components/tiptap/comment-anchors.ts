import { Extension, type Range } from "@tiptap/core"
import type { Editor } from "@tiptap/core"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

export type CommentAnchorThread = {
  id: string
  anchorFrom: number
  anchorTo: number
  status: "unresolved" | "resolved"
}

type CommentAnchorState = {
  threads: CommentAnchorThread[]
  hoveredThreadId: string | null
  selectedThreadId: string | null
}

type SetThreadsMeta = {
  type: "setThreads"
  threads: CommentAnchorThread[]
}

type HoverMeta = {
  type: "hover"
  id: string | null
}

type SelectMeta = {
  type: "select"
  id: string | null
}

type CommentAnchorMeta = SetThreadsMeta | HoverMeta | SelectMeta

const commentAnchorsPluginKey = new PluginKey<CommentAnchorState>("commentAnchors")

function clampAnchor(anchor: CommentAnchorThread, docSize: number): CommentAnchorThread {
  const from = Math.max(1, Math.min(anchor.anchorFrom, docSize))
  const to = Math.max(from, Math.min(anchor.anchorTo, docSize))

  return {
    ...anchor,
    anchorFrom: from,
    anchorTo: to,
  }
}

function buildDecorations(doc: Parameters<typeof DecorationSet.create>[0], state: CommentAnchorState) {
  const decorations: Decoration[] = []

  for (const thread of state.threads) {
    if (thread.anchorTo <= thread.anchorFrom) {
      continue
    }

    const classes = [
      "tiptap-thread",
      "tiptap-thread--inline",
      thread.status === "resolved" ? "tiptap-thread--resolved" : "tiptap-thread--unresolved",
      state.hoveredThreadId === thread.id ? "tiptap-thread--hovered" : "",
      state.selectedThreadId === thread.id ? "tiptap-thread--selected" : "",
    ]
      .filter(Boolean)
      .join(" ")

    decorations.push(
      Decoration.inline(thread.anchorFrom, thread.anchorTo, {
        class: classes,
        "data-thread-id": thread.id,
      })
    )
  }

  return DecorationSet.create(doc, decorations)
}

function getState(editor: Editor): CommentAnchorState | undefined {
  return commentAnchorsPluginKey.getState(editor.state)
}

function getThreadRange(editor: Editor, threadId: string): Range | null {
  const state = getState(editor)
  if (!state) {
    return null
  }

  const thread = state.threads.find((item) => item.id === threadId)
  if (!thread) {
    return null
  }

  return {
    from: thread.anchorFrom,
    to: thread.anchorTo,
  }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    commentAnchors: {
      setCommentThreads: (threads: CommentAnchorThread[]) => ReturnType
      hoverCommentThread: (id: string | null) => ReturnType
      selectCommentThread: (id: string | null) => ReturnType
      focusCommentThread: (id: string) => ReturnType
    }
  }
}

export const CommentAnchors = Extension.create<{
  onClickThread?: (id: string | null) => void
}>({
  name: "commentAnchors",

  addOptions() {
    return {}
  },

  addCommands() {
    return {
      setCommentThreads:
        (threads) =>
        ({ tr, dispatch }) => {
          const meta: CommentAnchorMeta = { type: "setThreads", threads }
          tr.setMeta(commentAnchorsPluginKey, meta)
          dispatch?.(tr)
          return true
        },
      hoverCommentThread:
        (id) =>
        ({ tr, dispatch }) => {
          const meta: CommentAnchorMeta = { type: "hover", id }
          tr.setMeta(commentAnchorsPluginKey, meta)
          dispatch?.(tr)
          return true
        },
      selectCommentThread:
        (id) =>
        ({ tr, dispatch }) => {
          const meta: CommentAnchorMeta = { type: "select", id }
          tr.setMeta(commentAnchorsPluginKey, meta)
          dispatch?.(tr)
          return true
        },
      focusCommentThread:
        (id) =>
        ({ editor, dispatch, tr }) => {
          const range = getThreadRange(editor, id)
          if (!range) {
            return false
          }

          if (range.from === range.to) {
            return true
          }

          const selection = TextSelection.create(editor.state.doc, range.from, range.to)
          tr.setSelection(selection)
          tr.scrollIntoView()
          dispatch?.(tr)
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<CommentAnchorState>({
        key: commentAnchorsPluginKey,
        state: {
          init: () => ({
            threads: [],
            hoveredThreadId: null,
            selectedThreadId: null,
          }),
          apply: (tr, pluginState: CommentAnchorState): CommentAnchorState => {
            let nextState = pluginState

            const meta = tr.getMeta(commentAnchorsPluginKey) as CommentAnchorMeta | undefined
            if (meta?.type === "setThreads") {
              const threads = meta.threads.map((item) => clampAnchor(item, tr.doc.content.size))
              nextState = {
                ...nextState,
                threads,
              }
            } else if (meta?.type === "hover") {
              nextState = {
                ...nextState,
                hoveredThreadId: meta.id,
              }
            } else if (meta?.type === "select") {
              nextState = {
                ...nextState,
                selectedThreadId: meta.id,
              }
            }

            if (tr.docChanged && nextState.threads.length > 0) {
              const mappedThreads = nextState.threads.map((thread: CommentAnchorThread) => {
                if (thread.anchorTo === thread.anchorFrom) {
                  return thread
                }

                const mappedFrom = tr.mapping.map(thread.anchorFrom, -1)
                const mappedTo = tr.mapping.map(thread.anchorTo, 1)
                return clampAnchor(
                  {
                    ...thread,
                    anchorFrom: mappedFrom,
                    anchorTo: mappedTo,
                  },
                  tr.doc.content.size
                )
              })

              nextState = {
                ...nextState,
                threads: mappedThreads,
              }
            }

            return nextState
          },
        },
        props: {
          decorations: (state) => {
            const pluginState = commentAnchorsPluginKey.getState(state)
            if (!pluginState) {
              return DecorationSet.empty
            }

            return buildDecorations(state.doc, pluginState)
          },
          handleClick: (_view, _pos, event: MouseEvent) => {
            const target = event.target as HTMLElement | null
            const threadElement = target?.closest<HTMLElement>("[data-thread-id]")
            const id = threadElement?.dataset.threadId ?? null

            this.options.onClickThread?.(id)
            return false
          },
        },
      }),
    ]
  },
})

export function getCommentThreadAnchors(editor: Editor): CommentAnchorThread[] {
  const state = getState(editor)
  if (!state) {
    return []
  }
  return state.threads
}

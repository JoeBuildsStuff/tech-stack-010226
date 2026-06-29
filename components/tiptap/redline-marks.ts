import { Mark, mergeAttributes } from "@tiptap/core"

/**
 * Redline (tracked changes) marks. These live *inside* the document so they
 * round-trip through the raw-HTML save/reload cycle for free via parseHTML /
 * renderHTML. A single logical change ("suggestion") shares one suggestionId;
 * a replacement (type-over-selection) reuses one suggestionId for both its
 * deletion and insertion marks so one accept/reject resolves the whole change.
 */

export type RedlineMarkAttributes = {
  suggestionId: string | null
  userId: string | null
  createdAt: string | null
}

function redlineAttributes() {
  return {
    suggestionId: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) =>
        element.getAttribute("data-suggestion-id"),
      renderHTML: (attributes: RedlineMarkAttributes) =>
        attributes.suggestionId
          ? { "data-suggestion-id": attributes.suggestionId }
          : {},
    },
    userId: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-user-id"),
      renderHTML: (attributes: RedlineMarkAttributes) =>
        attributes.userId ? { "data-user-id": attributes.userId } : {},
    },
    createdAt: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) =>
        element.getAttribute("data-created-at"),
      renderHTML: (attributes: RedlineMarkAttributes) =>
        attributes.createdAt
          ? { "data-created-at": attributes.createdAt }
          : {},
    },
  }
}

export const InsertionMark = Mark.create({
  name: "insertion",
  inclusive: false,
  addAttributes() {
    return redlineAttributes()
  },
  parseHTML() {
    return [{ tag: "span.redline-insertion" }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "redline-insertion" }),
      0,
    ]
  },
})

export const DeletionMark = Mark.create({
  name: "deletion",
  inclusive: false,
  addAttributes() {
    return redlineAttributes()
  },
  parseHTML() {
    return [{ tag: "span.redline-deletion" }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "redline-deletion" }),
      0,
    ]
  },
})

export const REDLINE_INSERTION_MARK = "insertion"
export const REDLINE_DELETION_MARK = "deletion"

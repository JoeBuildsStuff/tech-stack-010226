import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { APP_SCHEMA } from "@/lib/supabase/app-schema";
import { createClient } from "@/lib/supabase/server";
import { NotesSortDropdown, type NotesSortKey } from "./notes-sort-dropdown";
import { formatNoteIdBadge } from "./note-path";
import { createNoteAction } from "./actions";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FilePlusCorner } from "lucide-react";

type NotesPageProps = {
  searchParams?: Promise<{
    sort?: string | string[];
    order?: string | string[];
  }>;
};

const SORT_COLUMNS: Record<
  NotesSortKey,
  "updated_at" | "created_at" | "viewed_at"
> = {
  modified: "updated_at",
  created: "created_at",
  viewed: "viewed_at",
};

export default async function NotesPage({ searchParams }: NotesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const sortParam = Array.isArray(resolvedSearchParams.sort)
    ? resolvedSearchParams.sort[0]
    : resolvedSearchParams.sort;
  const orderParam = Array.isArray(resolvedSearchParams.order)
    ? resolvedSearchParams.order[0]
    : resolvedSearchParams.order;
  const sortBy: NotesSortKey =
    sortParam === "created" ||
    sortParam === "viewed" ||
    sortParam === "modified"
      ? sortParam
      : "modified";
  const sortOrder: "asc" | "desc" = orderParam === "asc" ? "asc" : "desc";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin");
  }

  const { data: notes, error: notesError } = await supabase
    .schema(APP_SCHEMA)
    .from("notes")
    .select("id, title, document_path, created_at, updated_at, viewed_at")
    .eq("user_id", user.id)
    .order(SORT_COLUMNS[sortBy], { ascending: sortOrder === "asc" });

  if (notesError) {
    throw notesError;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Notes</h1>
          <p className="text-sm text-muted-foreground">
            Create and open your notes.
          </p>
        </div>

        <form id="create-note-form" action={createNoteAction} />
        <ButtonGroup>
          <Button
            type="submit"
            variant="outline"
            form="create-note-form"
            size="sm"
          >
            <FilePlusCorner className="size-4 text-muted-foreground" /> New
          </Button>
          <NotesSortDropdown value={sortBy} order={sortOrder} />
        </ButtonGroup>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {notes && notes.length > 0 ? (
          notes.map((note) => {
            const idSlug = note.id;
            const badgeText = formatNoteIdBadge(idSlug);
            const sortTimestamp =
              sortBy === "created"
                ? note.created_at
                : sortBy === "viewed"
                  ? note.viewed_at
                  : note.updated_at;
            const sortLabel =
              sortBy === "created"
                ? "Created"
                : sortBy === "viewed"
                  ? "Last viewed"
                  : "Last updated";

            return (
              <Card
                key={note.id}
                className="hover:bg-secondary/50 p-2 border-none cursor-pointer"
              >
                <Link
                  key={note.id}
                  href={`/dashboard/notes/${encodeURIComponent(idSlug)}`}
                  className=""
                >
                  <CardHeader className="p-0">
                    <CardTitle>{note.title || "Untitled"}</CardTitle>
                    <CardDescription>
                      <Badge
                        className="text-muted-foreground"
                        variant="secondary"
                      >
                        {badgeText}
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-2">
                        {sortLabel}{" "}
                        {formatDistanceToNow(new Date(sortTimestamp), {
                          addSuffix: true,
                        })}
                      </span>
                    </CardDescription>
                  </CardHeader>
                </Link>
              </Card>
            );
          })
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-8 text-sm text-muted-foreground">
            You do not have any notes yet.
          </div>
        )}
      </div>
    </div>
  );
}

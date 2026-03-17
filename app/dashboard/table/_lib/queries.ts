import { createClient } from "@/lib/supabase/server";
import { APP_SCHEMA } from "@/lib/supabase/app-schema";
import { Contact } from "./validations";
import { PostgrestError } from "@supabase/supabase-js";
import type { SortingState, ColumnFiltersState } from "@tanstack/react-table";

// Map table column accessor keys to database column names
const columnNameMap: Record<string, string> = {
  idx: "idx",
  id: "id",
  name: "display_name",
  firstName: "first_name",
  lastName: "last_name",
  nickname: "nickname",
  email: "primary_email",
  phone: "primary_phone",
  age: "birthday", // Age is calculated from birthday
  birthday: "birthday",
  company: "company",
  jobTitle: "job_title",
  notes: "notes",
  isFavorite: "is_favorite",
  tags: "tags",
  registered: "created_at",
  updatedAt: "updated_at",
};

interface GetContactsParams {
  pagination?: {
    pageIndex: number;
    pageSize: number;
  };
  sorting?: SortingState;
  columnFilters?: ColumnFiltersState;
}

export async function getContacts(params?: GetContactsParams): Promise<{
  data: Contact[];
  count: number;
  error: PostgrestError | null;
}> {
  const supabase = await createClient();
  let query = supabase
    .schema(APP_SCHEMA)
    .from("registry_contacts")
    .select("*", { count: "exact" });

  // Apply filters
  if (params?.columnFilters && params.columnFilters.length > 0) {
    params.columnFilters.forEach((filter) => {
      const dbColumnName = columnNameMap[filter.id] || filter.id;

      // Handle filter value structure (can be object with operator/value or direct value)
      const filterValue =
        typeof filter.value === "object" &&
        filter.value !== null &&
        !Array.isArray(filter.value)
          ? (filter.value as { operator?: string; value?: unknown }).value
          : filter.value;

      const operator =
        typeof filter.value === "object" &&
        filter.value !== null &&
        !Array.isArray(filter.value)
          ? (filter.value as { operator?: string }).operator
          : undefined;

      if (
        filterValue === undefined ||
        filterValue === null ||
        filterValue === ""
      ) {
        // Skip empty filters unless it's an isEmpty/isNotEmpty operator
        if (operator === "isEmpty") {
          query = query.is(dbColumnName, null);
        } else if (operator === "isNotEmpty") {
          query = query.not("is", dbColumnName, null);
        }
        return;
      }

      // Apply filter based on operator
      switch (operator) {
        case "eq":
          query = query.eq(dbColumnName, filterValue);
          break;
        case "ne":
          query = query.neq(dbColumnName, filterValue);
          break;
        case "iLike":
          query = query.ilike(dbColumnName, `%${filterValue}%`);
          break;
        case "notILike":
          query = query.not("ilike", dbColumnName, `%${filterValue}%`);
          break;
        case "isEmpty":
          query = query.is(dbColumnName, null);
          break;
        case "isNotEmpty":
          query = query.not("is", dbColumnName, null);
          break;
        case "gt":
          query = query.gt(dbColumnName, filterValue);
          break;
        case "lt":
          query = query.lt(dbColumnName, filterValue);
          break;
        case "isBetween":
          // Handle range filters (expects array with [min, max])
          if (Array.isArray(filterValue) && filterValue.length === 2) {
            query = query
              .gte(dbColumnName, filterValue[0])
              .lte(dbColumnName, filterValue[1]);
          }
          break;
        case "inArray":
          // Handle array contains (for multi-select)
          if (Array.isArray(filterValue)) {
            query = query.contains(dbColumnName, filterValue);
          } else {
            query = query.contains(dbColumnName, [filterValue]);
          }
          break;
        case "notInArray":
          // Handle array does not contain
          if (Array.isArray(filterValue)) {
            query = query.not("cs", dbColumnName, filterValue);
          } else {
            query = query.not("cs", dbColumnName, [filterValue]);
          }
          break;
        default:
          // Default to iLike for string fields, eq for others
          if (typeof filterValue === "string") {
            query = query.ilike(dbColumnName, `%${filterValue}%`);
          } else {
            query = query.eq(dbColumnName, filterValue);
          }
      }
    });
  }

  // Apply sorting
  if (params?.sorting && params.sorting.length > 0) {
    params.sorting.forEach((sort, index) => {
      const dbColumnName = columnNameMap[sort.id] || sort.id;
      if (index === 0) {
        query = query.order(dbColumnName, { ascending: !sort.desc });
      } else {
        // For multiple sorts, we need to chain them
        // Note: Supabase supports multiple order() calls, but they're applied in sequence
        query = query.order(dbColumnName, {
          ascending: !sort.desc,
          nullsFirst: false,
        });
      }
    });
  } else {
    // Default sorting
    query = query.order("display_name", { ascending: true });
  }

  // Apply pagination
  if (params?.pagination) {
    const { pageIndex, pageSize } = params.pagination;
    const from = pageIndex * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
  }

  const { data, error, count } = await query;

  return {
    data: (data ?? []) as Contact[],
    count: count ?? 0,
    error,
  };
}

import { columns, type DataTableRow } from "./columns"
import { DataTable } from "@/components/data-table/data-table"
import type { DataTableState } from "@/lib/data-table"
import { Contact } from "../_lib/validations"
import { getContacts } from "../_lib/queries"
import { deleteContacts } from "../_lib/actions"

interface DataTableTableProps {
  initialState: DataTableState
}

// Transform the JSON data to match the table structure
function transformData(data: Contact[]): DataTableRow[] {
  return data.map((item) => {
    // Calculate age from birthday
    const calculateAge = (birthday: string): number => {
      const birthDate = new Date(birthday)
      const today = new Date()
      let age = today.getFullYear() - birthDate.getFullYear()
      const monthDiff = today.getMonth() - birthDate.getMonth()
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--
      }
      return age
    }

    // Format created_at date
    const formatDate = (dateString: string): string => {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      })
    }

    return {
      idx: item.idx,
      id: item.id,
      name: item.display_name || `${item.first_name} ${item.last_name}`.trim(),
      firstName: item.first_name || "",
      lastName: item.last_name || "",
      nickname: item.nickname || null,
      email: item.primary_email || "",
      phone: item.primary_phone || "",
      age: item.birthday ? calculateAge(item.birthday) : 0,
      birthday: item.birthday || "",
      company: item.company || "",
      jobTitle: item.job_title || "",
      notes: item.notes || "",
      isFavorite: item.is_favorite || false,
      tags: item.tags || [],
      registered: formatDate(item.created_at),
      updatedAt: formatDate(item.updated_at),
    }
  })
}

export default async function DataTableTable({ initialState }: DataTableTableProps) {
  // Fetch contacts with server-side filtering, sorting, and pagination
  const { data, count, error } = await getContacts({
    pagination: initialState.pagination,
    sorting: initialState.sorting,
    columnFilters: initialState.columnFilters,
  })

  if (error) {
    console.error(error)
    return <div>Error: {error.message}</div>
  }

  const transformedData = transformData(data)

  // Calculate page count from total count
  const pageCount = Math.ceil((count ?? 0) / (initialState.pagination.pageSize ?? 10))

  return (
      <DataTable 
        columns={columns} 
        data={transformedData} 
        pageCount={pageCount}
        initialState={initialState}
        tableKey="table-1"
        deleteAction={deleteContacts}
      />
  )
}

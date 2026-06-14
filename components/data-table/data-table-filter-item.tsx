"use client"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar } from "@/components/ui/calendar"
import { CalendarDays, ChevronsUpDown, GripVertical, X } from "lucide-react"
import { useState } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Table } from "@tanstack/react-table"
import { cn } from "@/lib/utils"
import { dataTableConfig } from "@/lib/data-table"
import type { ExtendedColumnFilter, FilterVariant, FilterOperator, RelativeDateValue } from "@/lib/data-table"
import { isRelativeDateValue, resolveRelativeDate } from "@/lib/data-table"
import { InputNumber } from "@/components/ui/input-number"

// Format date utility
function formatDate(
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions = {},
) {
  if (!date) return "";

  try {
    return new Intl.DateTimeFormat("en-US", {
      month: opts.month ?? "2-digit",
      day: opts.day ?? "2-digit", 
      year: opts.year ?? "2-digit",
      ...opts,
    }).format(new Date(date));
  } catch {
    return "";
  }
}

// Get filter operators for a specific variant
function getFilterOperators(filterVariant: FilterVariant) {
  const operatorMap: Record<FilterVariant, { label: string; value: FilterOperator }[]> = {
    text: dataTableConfig.textOperators,
    number: dataTableConfig.numericOperators,
    range: dataTableConfig.numericOperators,
    date: dataTableConfig.dateOperators,
    dateRange: dataTableConfig.dateOperators,
    boolean: dataTableConfig.booleanOperators,
    select: dataTableConfig.selectOperators,
    multiSelect: dataTableConfig.multiSelectOperators,
  };

  return operatorMap[filterVariant] ?? dataTableConfig.textOperators;
}

// Get default filter operator for a variant
function getDefaultFilterOperator(filterVariant: FilterVariant): FilterOperator {
  const operators = getFilterOperators(filterVariant);
  return operators[0]?.value ?? "iLike";
}

interface DataTableFilterItemProps<TData> {
  table: Table<TData>
  filter: ExtendedColumnFilter<TData>
  onFilterChange: (filter: ExtendedColumnFilter<TData>) => void
  onRemove: () => void
  index: number
  logicalOperator: "and" | "or"
  onLogicalOperatorChange: (value: "and" | "or") => void
}

export default function DataTableFilterItem<TData>({
  table,
  filter,
  onFilterChange,
  onRemove,
  index,
  logicalOperator,
  onLogicalOperatorChange,
}: DataTableFilterItemProps<TData>) {
  const [columnOpen, setColumnOpen] = useState(false)
  const [operatorOpen, setOperatorOpen] = useState(false)
  const [valueOpen, setValueOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: filter.filterId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const columns = table
    .getAllColumns()
    .filter(
      (column) =>
        column.getCanFilter() &&
        column.id !== "select" &&
        column.id !== "actions"
    )

  const selectedColumn = columns.find((col) => col.id === filter.id)
  const columnMeta = selectedColumn?.columnDef.meta
  const filterVariant: FilterVariant = columnMeta?.variant ?? "text"
  const operators = getFilterOperators(filterVariant)

  const renderLogicalOperator = () => {
    if (index === 0) {
      return <div className="w-16 text-center text-sm font-medium text-muted-foreground">Where</div>
    }
    if (index === 1) {
      return (
        <Button
          variant="secondary"
          size="sm"
          className="w-16 capitalize"
          onClick={() =>
            onLogicalOperatorChange(logicalOperator === "and" ? "or" : "and")
          }
        >
          {logicalOperator}
        </Button>
      )
    }
    return <div className="w-16 text-center text-sm font-medium text-muted-foreground capitalize">{logicalOperator}</div>
  }

  const renderValueInput = () => {
    const placeholder = columnMeta?.placeholder ?? "Enter value..."
    
    // Disable input for isEmpty and isNotEmpty operators
    const isEmptyOperator = ["isEmpty", "isNotEmpty"].includes(filter.operator)
    if (isEmptyOperator) {
      return (
        <div className="w-40 flex items-center justify-center text-sm text-muted-foreground border rounded px-3 py-2">
          No value needed
        </div>
      )
    }

    switch (filterVariant) {
      case "select": {
        const options = columnMeta?.options ?? []
        return (
          <Popover open={valueOpen} onOpenChange={setValueOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-40 justify-start">
                {filter.value ? 
                  (options.find(option => option.value === filter.value)?.label ?? String(filter.value))
                  : "Select value..."
                }
                <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search..." />
                <CommandList>
                  <CommandEmpty>No options found.</CommandEmpty>
                  <CommandGroup>
                    {options.map((option) => (
                      <CommandItem
                        key={option.value}
                        onSelect={() => {
                          onFilterChange({ ...filter, value: option.value })
                          setValueOpen(false)
                        }}
                      >
                        {option.icon && <option.icon className="mr-2 h-4 w-4" />}
                        {option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )
      }

      case "multiSelect": {
        const options = columnMeta?.options ?? []
        const selectedValues = Array.isArray(filter.value) ? filter.value : []
        
        return (
          <Popover open={valueOpen} onOpenChange={setValueOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-40 justify-start">
                {selectedValues.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedValues.slice(0, 2).map((value) => (
                      <Badge key={String(value)} variant="secondary" className="text-xs">
                        {(options.find(option => option.value === value)?.label ?? String(value))}
                      </Badge>
                    ))}
                    {selectedValues.length > 2 && (
                      <Badge variant="secondary" className="text-xs">
                        +{selectedValues.length - 2}
                      </Badge>
                    )}
                  </div>
                ) : (
                  "Select values..."
                )}
                <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search..." />
                <CommandList>
                  <CommandEmpty>No options found.</CommandEmpty>
                  <CommandGroup>
                    {options.map((option) => (
                      <CommandItem
                        key={option.value}
                        onSelect={() => {
                          const newValues = selectedValues.includes(option.value)
                            ? selectedValues.filter(v => v !== option.value)
                            : [...selectedValues, option.value]
                          onFilterChange({ ...filter, value: newValues })
                        }}
                      >
                        <Checkbox
                          checked={selectedValues.includes(option.value)}
                          className="mr-2"
                        />
                        {option.icon && <option.icon className="mr-2 h-4 w-4" />}
                        {option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )
      }

      case "boolean": {
        return (
          <Select
            value={filter.value as string}
            onValueChange={(value) => onFilterChange({ ...filter, value })}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">True</SelectItem>
              <SelectItem value="false">False</SelectItem>
            </SelectContent>
          </Select>
        )
      }

      case "date": {
        const isBetween = filter.operator === "isBetween"
        const relativeValue = isRelativeDateValue(filter.value)
          ? filter.value
          : undefined
        const mode: "absolute" | "relative" = !isBetween && relativeValue
          ? "relative"
          : "absolute"

        const defaultRelativeValue: RelativeDateValue = {
          type: "relative",
          amount: 3,
          unit: "days",
          direction: "from_now",
        }

        const dateValue = (() => {
          if (relativeValue || isBetween) {
            return undefined
          }

          const raw = filter.value
          if (!raw) return undefined
          if (raw instanceof Date) return raw
          if (typeof raw === "string") {
            const parsed = new Date(raw)
            return Number.isNaN(parsed.getTime()) ? undefined : parsed
          }
          return undefined
        })()

        const handleModeChange = (nextMode: "absolute" | "relative") => {
          if (nextMode === "relative") {
            onFilterChange({
              ...filter,
              value: relativeValue ?? { ...defaultRelativeValue },
            })
          } else {
            onFilterChange({
              ...filter,
              value: "",
            })
          }
        }

        const renderAbsolutePicker = () => (
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-40 justify-start text-left font-normal",
                  !dateValue && "text-muted-foreground"
                )}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                {dateValue ? formatDate(dateValue, { year: "numeric" }) : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateValue}
                onSelect={(selectedDate) => {
                  onFilterChange({
                    ...filter,
                    value: selectedDate ? selectedDate.toISOString() : "",
                  })
                  setCalendarOpen(false)
                }}
              />
            </PopoverContent>
          </Popover>
        )

        const renderRelativeControls = () => {
          const activeRelative = relativeValue ?? { ...defaultRelativeValue }
          const previewDate = resolveRelativeDate(activeRelative)

          const updateRelative = (partial: Partial<RelativeDateValue>) => {
            onFilterChange({
              ...filter,
              value: {
                ...activeRelative,
                ...partial,
              },
            })
          }

          return (
            <div className="flex items-center gap-2">
              <InputNumber
                value={activeRelative.amount}
                onChange={(value) => {
                  if (Number.isNaN(value) || value < 0) {
                    return
                  }
                  updateRelative({ amount: Math.round(value) })
                }}
                className="w-16"
              />
              <Select
                value={activeRelative.unit}
                onValueChange={(unit) => updateRelative({ unit: unit as RelativeDateValue["unit"] })}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="days">day(s)</SelectItem>
                  <SelectItem value="weeks">week(s)</SelectItem>
                  <SelectItem value="months">month(s)</SelectItem>
                  <SelectItem value="years">year(s)</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={activeRelative.direction}
                onValueChange={(direction) => updateRelative({ direction: direction as RelativeDateValue["direction"] })}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ago">ago</SelectItem>
                  <SelectItem value="from_now">from now</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                ({formatDate(previewDate, { month: "short", day: "2-digit", year: "numeric" })})
              </div>
            </div>
          )
        }

        return (
          <div className="flex items-center gap-2">
            {!isBetween && (
              <Select value={mode} onValueChange={(value) => handleModeChange(value as "absolute" | "relative") }>
                <SelectTrigger className="w-36 justify-start text-left">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="absolute">Specific date</SelectItem>
                  <SelectItem value="relative">Relative to now</SelectItem>
                </SelectContent>
              </Select>
            )}
            {mode === "relative" ? renderRelativeControls() : renderAbsolutePicker()}
          </div>
        )
      }

      case "number": {
        const unit = columnMeta?.unit
        
        // Handle "is between" operator with two inputs
        if (filter.operator === "isBetween") {
          const values = Array.isArray(filter.value) ? filter.value : ["", ""]
          return (
            <div className="flex gap-2 w-80">
              <InputNumber
                value={values[0] || ""}
                onChange={(value) => {
                  const newValues = [String(value || ""), values[1] || ""]
                  onFilterChange({ ...filter, value: newValues })
                }}
                placeholder="Min"
                unit={unit}
                className="flex-1"
              />
              <div className="flex items-center text-sm text-muted-foreground">and</div>
              <InputNumber
                value={values[1] || ""}
                onChange={(value) => {
                  const newValues = [values[0] || "", String(value || "")]
                  onFilterChange({ ...filter, value: newValues })
                }}
                placeholder="Max"
                unit={unit}
                className="flex-1"
              />
            </div>
          )
        }
        
        return (
          <InputNumber
            value={filter.value as string}
            onChange={(value) => onFilterChange({ ...filter, value: String(value || "") })}
            placeholder={placeholder}
            unit={unit}
            className="w-40"
          />
        )
      }

      default: {
        return (
          <Input
            placeholder={placeholder}
            value={filter.value as string}
            onChange={(e) => onFilterChange({ ...filter, value: e.target.value })}
            className="w-40"
          />
        )
      }
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-row items-center gap-2"
    >
      <Button
        variant="ghost"
        size="icon"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </Button>

      {renderLogicalOperator()}

      <Popover open={columnOpen} onOpenChange={setColumnOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-32 justify-start">
            <span className="truncate">
              {(selectedColumn?.columnDef.meta?.label ?? filter.id) || "Column"}
            </span>
            <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-32 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search..." />
            <CommandList>
              <CommandEmpty>No columns found.</CommandEmpty>
              <CommandGroup>
                {columns.map((column) => (
                  <CommandItem
                    key={column.id}
                    onSelect={() => {
                      const newVariant = column.columnDef.meta?.variant ?? "text"
                      const newOperator = getDefaultFilterOperator(newVariant)
                      onFilterChange({
                        ...filter,
                        id: column.id as Extract<keyof TData, string>,
                        variant: newVariant,
                        operator: newOperator,
                        value: "",
                      })
                      setColumnOpen(false)
                    }}
                  >
                    {(column.columnDef.meta?.label ?? column.id)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Popover open={operatorOpen} onOpenChange={setOperatorOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-32 justify-start">
            <span className="truncate">
              {(operators.find(op => op.value === filter.operator)?.label ?? "Operator")}
            </span>
            <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-36 p-0" align="start">
          <Command>
            <CommandList>
              <CommandGroup>
                {operators.map((operator) => (
                  <CommandItem
                    key={operator.value}
                    onSelect={() => {
                      onFilterChange({ ...filter, operator: operator.value })
                      setOperatorOpen(false)
                    }}
                  >
                    {operator.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {renderValueInput()}

      <Button variant="ghost" size="icon" onClick={onRemove}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

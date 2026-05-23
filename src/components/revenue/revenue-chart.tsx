'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  Cell,
} from 'recharts'
import { formatCurrencyShort, formatCurrencyFull } from '@/lib/utils'

interface MonthlyData {
  period: string
  label: string
  revenue: number
  orders: number
  isLocked?: boolean
}

interface EmployeeData {
  name: string
  revenue: number
  orders: number
  employeeId: string
}

interface RevenueBarChartProps {
  data: MonthlyData[]
  highlightPeriod?: string
}

interface EmployeeBarChartProps {
  data: EmployeeData[]
}

const COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
]

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-300 mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-600 dark:text-slate-400">{entry.name}</span>
          </div>
          <span className="font-medium text-slate-900 dark:text-white">
            {entry.name === 'Đơn hàng'
              ? entry.value
              : formatCurrencyFull(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function RevenueBarChart({ data, highlightPeriod }: RevenueBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => formatCurrencyShort(v)}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="revenue" name="Doanh thu" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.period}
              fill={entry.period === highlightPeriod ? '#3b82f6' : '#93c5fd'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function RevenueLineChart({ data }: { data: MonthlyData[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => formatCurrencyShort(v)}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Line
          type="monotone"
          dataKey="revenue"
          name="Doanh thu"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 4, fill: '#3b82f6' }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function EmployeeRevenueChart({ data }: EmployeeBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v) => formatCurrencyShort(v)}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          width={80}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="revenue" name="Doanh thu" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={entry.employeeId} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

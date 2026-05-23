'use client'

import { useState, useEffect } from 'react'
import {
  Tag,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
} from 'lucide-react'
import { cn, normalizeVietnameseTag } from '@/lib/utils'

interface TagEntry {
  id?: string
  tag: string
  normalizedTag: string
  employeeId: string
  employeeName: string
  platform: 'facebook' | 'tiktok'
  isActive: boolean
  isDirty?: boolean
  isNew?: boolean
}

interface Employee {
  id: string
  name: string
}

interface TagMappingWizardProps {
  initialTags: TagEntry[]
  employees: Employee[]
  onSave: (tags: TagEntry[]) => Promise<void>
}

const PLATFORM_LABELS = {
  facebook: 'Facebook',
  tiktok: 'TikTok',
}

const TAG_TEMPLATES = [
  { tag: 'page_HuyK - Kim Hoàn', platform: 'facebook' as const },
  { tag: 'page_HuyK - Nhẫn Cưới', platform: 'facebook' as const },
  { tag: 'page_HuyK - Trang Sức', platform: 'facebook' as const },
  { tag: 'tiktok_business_HuyK - Kim Hoàn', platform: 'tiktok' as const },
  { tag: 'tiktok_business_HuyK - Nhẫn Cưới', platform: 'tiktok' as const },
]

export function TagMappingWizard({ initialTags, employees, onSave }: TagMappingWizardProps) {
  const [tags, setTags] = useState<TagEntry[]>(initialTags)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [filterPlatform, setFilterPlatform] = useState<'all' | 'facebook' | 'tiktok'>('all')
  const [newTag, setNewTag] = useState<Partial<TagEntry>>({
    platform: 'facebook',
    isActive: true,
    isNew: true,
    isDirty: true,
  })
  const [showAddForm, setShowAddForm] = useState(false)

  const filteredTags = tags.filter((t) => {
    const matchesSearch =
      !search ||
      t.tag.toLowerCase().includes(search.toLowerCase()) ||
      t.employeeName.toLowerCase().includes(search.toLowerCase())
    const matchesPlatform = filterPlatform === 'all' || t.platform === filterPlatform
    return matchesSearch && matchesPlatform
  })

  const dirtyCount = tags.filter((t) => t.isDirty || t.isNew).length

  function updateTag(index: number, field: keyof TagEntry, value: string | boolean) {
    setTags((prev) =>
      prev.map((t, i) => {
        if (i !== index) return t
        const updated = { ...t, [field]: value, isDirty: true }
        if (field === 'tag') {
          updated.normalizedTag = normalizeVietnameseTag(value as string)
        }
        if (field === 'employeeId') {
          const emp = employees.find((e) => e.id === value)
          updated.employeeName = emp?.name || ''
        }
        return updated
      })
    )
  }

  function removeTag(index: number) {
    setTags((prev) => prev.filter((_, i) => i !== index))
  }

  function addTag() {
    if (!newTag.tag || !newTag.employeeId) return

    const emp = employees.find((e) => e.id === newTag.employeeId)
    const entry: TagEntry = {
      tag: newTag.tag!,
      normalizedTag: normalizeVietnameseTag(newTag.tag!),
      employeeId: newTag.employeeId!,
      employeeName: emp?.name || '',
      platform: newTag.platform || 'facebook',
      isActive: true,
      isNew: true,
      isDirty: true,
    }

    setTags((prev) => [...prev, entry])
    setNewTag({ platform: 'facebook', isActive: true, isNew: true, isDirty: true })
    setShowAddForm(false)
  }

  function applyTemplate(template: { tag: string; platform: 'facebook' | 'tiktok' }) {
    setNewTag((prev) => ({
      ...prev,
      tag: template.tag,
      platform: template.platform,
    }))
    setShowAddForm(true)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      await onSave(tags.filter((t) => t.isDirty || t.isNew))
      setTags((prev) => prev.map((t) => ({ ...t, isDirty: false, isNew: false })))
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Lỗi không xác định')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Quản lý mapping tag ({tags.length} tag)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Map tag kênh Sapo với nhân viên tương ứng
          </p>
        </div>

        <div className="flex items-center gap-2">
          {dirtyCount > 0 && (
            <span className="text-xs text-orange-600 dark:text-orange-400">
              {dirtyCount} thay đổi chưa lưu
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || dirtyCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Đang lưu...' : saveSuccess ? 'Đã lưu!' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {saveError}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm tag hoặc nhân viên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {(['all', 'facebook', 'tiktok'] as const).map((platform) => (
            <button
              key={platform}
              onClick={() => setFilterPlatform(platform)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition',
                filterPlatform === platform
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              )}
            >
              {platform === 'all' ? 'Tất cả' : PLATFORM_LABELS[platform]}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-blue-400 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition"
        >
          <Plus className="w-4 h-4" />
          Thêm tag mới
        </button>
      </div>

      {/* Templates */}
      <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
          Mẫu tag nhanh:
        </p>
        <div className="flex flex-wrap gap-2">
          {TAG_TEMPLATES.map((template) => (
            <button
              key={template.tag}
              onClick={() => applyTemplate(template)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition"
            >
              <Tag className="w-3 h-3" />
              {template.tag}
            </button>
          ))}
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="border border-blue-200 dark:border-blue-800 rounded-xl p-4 bg-blue-50 dark:bg-blue-950/50 space-y-3">
          <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">Thêm tag mới</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Tên tag (từ Sapo)
              </label>
              <input
                type="text"
                value={newTag.tag || ''}
                onChange={(e) => setNewTag((p) => ({ ...p, tag: e.target.value }))}
                placeholder="page_HuyK - Kim Hoàn"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {newTag.tag && (
                <p className="text-xs text-slate-400 mt-1">
                  Normalized: {normalizeVietnameseTag(newTag.tag)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Nhân viên
              </label>
              <select
                value={newTag.employeeId || ''}
                onChange={(e) => setNewTag((p) => ({ ...p, employeeId: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Chọn nhân viên --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Nền tảng
              </label>
              <select
                value={newTag.platform || 'facebook'}
                onChange={(e) =>
                  setNewTag((p) => ({ ...p, platform: e.target.value as 'facebook' | 'tiktok' }))
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="facebook">Facebook</option>
                <option value="tiktok">TikTok</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={addTag}
              disabled={!newTag.tag || !newTag.employeeId}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
            >
              Thêm
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Tags table */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                {['Tag (Sapo)', 'Normalized', 'Nhân viên', 'Nền tảng', 'Kích hoạt', ''].map(
                  (h) => (
                    <th
                      key={h}
                      className="py-2.5 px-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredTags.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 text-center text-sm text-slate-400"
                  >
                    Không có tag nào
                  </td>
                </tr>
              ) : (
                filteredTags.map((tag, idx) => {
                  // Find real index in unfiltered array
                  const realIdx = tags.findIndex((t) => t === tag)

                  return (
                    <tr
                      key={tag.id || idx}
                      className={cn(
                        'border-b border-slate-100 dark:border-slate-700',
                        tag.isDirty || tag.isNew
                          ? 'bg-orange-50/50 dark:bg-orange-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      )}
                    >
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={tag.tag}
                          onChange={(e) => updateTag(realIdx, 'tag', e.target.value)}
                          className="w-full min-w-32 px-2 py-1 text-xs border border-transparent rounded focus:border-blue-400 focus:outline-none bg-transparent focus:bg-white dark:focus:bg-slate-700"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-400 font-mono">
                        {tag.normalizedTag}
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={tag.employeeId}
                          onChange={(e) => updateTag(realIdx, 'employeeId', e.target.value)}
                          className="text-xs border border-transparent rounded px-2 py-1 bg-transparent focus:border-blue-400 focus:outline-none focus:bg-white dark:focus:bg-slate-700"
                        >
                          <option value="">-- Chọn --</option>
                          {employees.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={cn(
                            'inline-block text-xs px-2 py-0.5 rounded-full font-medium',
                            tag.platform === 'facebook'
                              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                              : 'bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300'
                          )}
                        >
                          {PLATFORM_LABELS[tag.platform]}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => updateTag(realIdx, 'isActive', !tag.isActive)}
                          className={cn(
                            'w-8 h-4 rounded-full transition-colors relative',
                            tag.isActive
                              ? 'bg-green-500'
                              : 'bg-slate-300 dark:bg-slate-600'
                          )}
                        >
                          <span
                            className={cn(
                              'absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform',
                              tag.isActive ? 'translate-x-4' : 'translate-x-0.5'
                            )}
                          />
                        </button>
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => removeTag(realIdx)}
                          className="p-1 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

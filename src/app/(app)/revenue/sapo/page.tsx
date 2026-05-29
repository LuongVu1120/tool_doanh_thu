'use client'

import { useState } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle, Copy, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSapoLegacySync, useSapoStatus } from '@/hooks/use-sapo-v2'
import { useQueryClient } from '@tanstack/react-query'
import { sapoKeys } from '@/lib/sapo-v2/queries'

export default function SapoSettingsPage() {
  const queryClient = useQueryClient()
  const statusQuery = useSapoStatus()
  const syncMutation = useSapoLegacySync()

  const status = statusQuery.data ?? null
  const loading = statusQuery.isLoading && !statusQuery.data
  const syncing = syncMutation.isPending

  const [actionError, setActionError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const fetchError = statusQuery.error
  const error =
    actionError ||
    (fetchError instanceof Error ? fetchError.message : fetchError ? String(fetchError) : null)

  async function refreshStatus() {
    setActionError(null)
    await queryClient.invalidateQueries({ queryKey: sapoKeys.status() })
  }

  async function syncNow(full = false) {
    setActionError(null)
    setMessage(null)
    try {
      const data = await syncMutation.mutateAsync(full)
      const total = (data.results || []).reduce((sum: number, item: { upserted: number }) => sum + item.upserted, 0)
      setMessage(`Đã sync ${total} đơn từ Sapo`)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Lỗi không xác định')
    }
  }

  async function copyWebhookUrl() {
    if (!status?.webhook.url) return
    await navigator.clipboard.writeText(status.webhook.url)
    setMessage('Đã copy webhook URL')
  }

  const connected = (status?.connections.length || 0) > 0
  const privateAppReady = Boolean(
    status?.configured.store && status?.configured.apiKey && status?.configured.apiSecret
  )
  const privateTokenReady = Boolean(status?.configured.store && status?.configured.accessToken)
  const authLabel = privateAppReady
    ? 'Đã cấu hình Private App (Basic Auth) trong .env'
    : privateTokenReady
      ? 'Đã cấu hình Private Token (OAuth) trong .env'
      : 'Thêm SAPO_STORE + SAPO_API_KEY + SAPO_API_SECRET (Private App) hoặc SAPO_ACCESS_TOKEN (OAuth) vào .env'

  const displayError = error || (status?.migrationRequired && status.error ? status.error : null)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Kết nối Sapo</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Kéo đơn đã thanh toán về dashboard doanh thu realtime
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void refreshStatus()} disabled={loading}>
          <RefreshCw className="w-4 h-4" />
          Làm mới
        </Button>
      </div>

      {displayError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {displayError}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          {message}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Xác thực Sapo</h2>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
            <KeyRound className="w-4 h-4" />
            {authLabel}
          </div>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Hỗ trợ 2 chế độ: Private App (Basic Auth với API Key + Secret) hoặc OAuth (Access Token).
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <ConfigFlag label="Sapo store" ok={Boolean(status?.configured.store)} />
          <ConfigFlag label="API Key" ok={Boolean(status?.configured.apiKey)} />
          <ConfigFlag label="API Secret" ok={Boolean(status?.configured.apiSecret)} />
          <ConfigFlag label="Access token" ok={Boolean(status?.configured.accessToken)} />
          <ConfigFlag label="Webhook secret" ok={Boolean(status?.configured.webhookSecret)} />
          <ConfigFlag label="Cron secret" ok={Boolean(status?.configured.cronSecret)} />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Kết nối hiện tại</h2>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => void syncNow(false)} disabled={!connected || syncing}>
              <RefreshCw className="w-4 h-4" />
              Sync ngay
            </Button>
            <Button type="button" variant="outline" onClick={() => void syncNow(true)} disabled={!connected || syncing}>
              Full sync
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Store</th>
                <th className="px-3 py-2">Scopes</th>
                <th className="px-3 py-2">Last sync</th>
                <th className="px-3 py-2">Cursor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {status?.connections.map((connection) => (
                <tr key={connection.id}>
                  <td className="px-3 py-2 font-medium">{connection.store}.mysapo.net</td>
                  <td className="px-3 py-2 text-slate-500">{connection.scopes || connection.source || '-'}</td>
                  <td className="px-3 py-2 text-slate-500">{formatDateTime(connection.last_sync_at)}</td>
                  <td className="px-3 py-2 text-slate-500">{formatDateTime(connection.sync_cursor_modified_on)}</td>
                </tr>
              ))}
              {!loading && !connected && (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-400" colSpan={4}>
                    Chưa có kết nối Sapo
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Webhook</h2>
          <Button type="button" variant="outline" onClick={copyWebhookUrl} disabled={!status?.webhook.url}>
            <Copy className="w-4 h-4" />
            Copy URL
          </Button>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="break-all font-mono text-xs text-slate-600 dark:text-slate-300">
            {status?.webhook.url || '-'}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {status?.webhook.topics.map((topic) => (
              <span key={topic} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {topic}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function ConfigFlag({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
      {ok ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
    </div>
  )
}

function formatDateTime(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (isNaN(date.getTime())) return value
  return date.toLocaleString('vi-VN')
}

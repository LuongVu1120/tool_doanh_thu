import {
  TrendingUp,
  MessageSquare,
  FileSpreadsheet,
  Wrench,
  Package,
  BarChart2,
} from 'lucide-react'
import { ToolCard } from '@/components/layout/tool-card'

const tools = [
  {
    id: 'revenue',
    title: 'Doanh thu Media',
    description:
      'Theo dõi doanh thu theo nhân viên và kênh từ Sapo API. Dashboard team với phân tích theo kênh trực quan.',
    href: '/revenue/sapo-team',
    icon: <TrendingUp className="w-5 h-5" />,
    badges: ['Sapo', 'API'],
    color: 'green' as const,
    isNew: true,
  },
  {
    id: 'chat',
    title: 'Chatbot AI',
    description:
      'Trợ lý AI hỗ trợ học tập, trả lời câu hỏi về sản phẩm kim hoàn và nghiệp vụ nội bộ.',
    href: '/chat',
    icon: <MessageSquare className="w-5 h-5" />,
    badges: ['Claude AI', 'Chat'],
    color: 'purple' as const,
    isBeta: true,
  },
  {
    id: 'inventory',
    title: 'Quản lý kho',
    description:
      'Theo dõi tồn kho sản phẩm kim hoàn, nhập/xuất kho, báo cáo hàng tồn theo danh mục.',
    href: '/inventory',
    icon: <Package className="w-5 h-5" />,
    badges: ['Kho', 'Báo cáo'],
    color: 'orange' as const,
    comingSoon: true,
  },
  {
    id: 'reports',
    title: 'Báo cáo tổng hợp',
    description:
      'Tổng hợp số liệu kinh doanh, so sánh kỳ, xuất báo cáo PDF/Excel cho ban lãnh đạo.',
    href: '/reports',
    icon: <BarChart2 className="w-5 h-5" />,
    badges: ['PDF', 'Excel'],
    color: 'blue' as const,
    comingSoon: true,
  },
  {
    id: 'orders',
    title: 'Quản lý đơn hàng',
    description:
      'Xem và tra cứu lịch sử đơn hàng từ tất cả kênh bán, tìm kiếm nhanh theo mã đơn.',
    href: '/orders',
    icon: <FileSpreadsheet className="w-5 h-5" />,
    badges: ['Sapo', 'Lịch sử'],
    color: 'slate' as const,
    comingSoon: true,
  },
  {
    id: 'tools',
    title: 'Tiện ích khác',
    description:
      'Các tiện ích nhỏ hỗ trợ công việc hàng ngày: đổi đơn vị, tính giá, kiểm tra mã hàng...',
    href: '/utilities',
    icon: <Wrench className="w-5 h-5" />,
    badges: ['Tiện ích'],
    color: 'slate' as const,
    comingSoon: true,
  },
]

export default function ToolHubPage() {
  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Tổng quan</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Chọn công cụ bạn muốn sử dụng hôm nay
        </p>
      </div>

      {/* Featured tool */}
      <div className="mb-8 p-6 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-blue-200 text-sm font-medium mb-1">Công cụ nổi bật</p>
            <h2 className="text-xl font-bold mb-2">Doanh thu Media</h2>
            <p className="text-blue-100 text-sm max-w-md">
              Đồng bộ đơn hàng từ Sapo API để tự động tính doanh thu theo nhân viên và phân tích
              theo kênh trực quan trên Sapo Team dashboard.
            </p>
            <a
              href="/revenue/sapo-team"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-white text-blue-700 text-sm font-semibold rounded-lg hover:bg-blue-50 transition-colors"
            >
              <TrendingUp className="w-4 h-4" />
              Mở công cụ
            </a>
          </div>
          <div className="hidden sm:flex w-16 h-16 bg-blue-500/50 rounded-2xl items-center justify-center">
            <TrendingUp className="w-8 h-8 text-white" />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Công cụ khả dụng', value: '2' },
          { label: 'Đang phát triển', value: '4' },
          { label: 'Thành viên', value: '–' },
          { label: 'Phiên bản', value: '0.1.0' },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4"
          >
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tools grid */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wide">
          Tất cả công cụ
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool) => (
            <ToolCard
              key={tool.id}
              title={tool.title}
              description={tool.description}
              href={tool.href}
              icon={tool.icon}
              badges={tool.badges}
              color={tool.color}
              isNew={tool.isNew}
              isBeta={'isBeta' in tool ? tool.isBeta : undefined}
              comingSoon={'comingSoon' in tool ? tool.comingSoon : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

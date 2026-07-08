import { lazy, Suspense, ComponentType } from 'react'
import { LucideIcon } from 'lucide-react'

interface GenericAdminPageProps {
  title: string
  subtitle: string
  icon: LucideIcon
  iconColors: string
  component: ComponentType<any>
  props?: Record<string, any>
}

const GenericAdminPage = ({
  title,
  subtitle,
  icon: Icon,
  iconColors,
  component: Component,
  props = {}
}: GenericAdminPageProps) => {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className={`w-12 h-12 bg-gradient-to-br ${iconColors} rounded-xl flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
      </div>

      <Suspense fallback={
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-64 bg-gray-100 rounded" />
          </div>
        </div>
      }>
        <Component {...props} />
      </Suspense>
    </div>
  )
}

export default GenericAdminPage

import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase/config'
import {
  LayoutDashboard, Package, Banknote, Users, Wallet, Building2,
  AlertTriangle, Calculator, Archive, LogOut, TrendingUp, FileText,
  Settings, Truck, Star, MessageCircle, MapPin
} from 'lucide-react'
import LiveClock from '../components/LiveClock'
import WorkingDateIndicator from '../components/WorkingDateIndicator'
import CompanyContact from '../components/CompanyContact'
import { AdminProvider } from '../contexts/AdminContext'

const AdminLayout = () => {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const handleLogout = async () => {
    try {
      await signOut(auth)
      navigate('/login')
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  const navItems = [
    { path: '/admin/home', icon: LayoutDashboard, label: 'Accueil', color: 'purple' },
    { path: '/admin/expeditions', icon: Package, label: 'Expéditions', color: 'blue' },
    { path: '/admin/cod', icon: Banknote, label: 'Contre Remboursement', color: 'green' },
    { path: '/admin/reglements', icon: FileText, label: 'Règlements', color: 'indigo' },
    { path: '/admin/caisse', icon: Wallet, label: 'Caisse', color: 'emerald' },
    { path: '/admin/banque', icon: Building2, label: 'Banque', color: 'cyan' },
    { path: '/admin/agencies', icon: MapPin, label: 'Agences', color: 'orange' },
    { path: '/admin/port-agencies', icon: TrendingUp, label: 'Port par agence', color: 'pink' },
    { path: '/admin/users', icon: Users, label: 'Utilisateurs', color: 'violet' },
    { path: '/admin/employees', icon: Star, label: 'Employés', color: 'yellow' },
    { path: '/admin/alerts', icon: AlertTriangle, label: 'Alertes', color: 'red' },
    { path: '/admin/clients', icon: MessageCircle, label: 'Clients', color: 'teal' },
    { path: '/admin/tariffs', icon: Calculator, label: 'Tarifs', color: 'amber' },
    { path: '/admin/exports', icon: Archive, label: 'Exports', color: 'slate' },
    { path: '/admin/archivage', icon: Archive, label: 'Archivage', color: 'gray' },
    { path: '/admin/lost', icon: Package, label: 'Colis perdus', color: 'red' },
    { path: '/admin/returns', icon: Truck, label: 'Retours', color: 'orange' },
    { path: '/admin/notes', icon: FileText, label: 'Notes', color: 'blue' },
    { path: '/admin/activity', icon: TrendingUp, label: 'Activité', color: 'green' },
    { path: '/admin/utilities', icon: Settings, label: 'Utilitaires', color: 'gray' },
    { path: '/admin/permissions', icon: Settings, label: 'Permissions', color: 'purple' },
  ]

  return (
    <AdminProvider>
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-[1800px] mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center">
                  <LayoutDashboard className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                    Admin Dashboard
                  </h1>
                  <p className="text-xs text-gray-500">{auth.currentUser?.email}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <WorkingDateIndicator />
              <LiveClock />
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex">
          {/* Sidebar */}
          <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white border-r border-gray-200 min-h-[calc(100vh-73px)] transition-all duration-300 sticky top-[73px] overflow-y-auto`}>
            <nav className="p-3 space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                      isActive
                        ? `bg-${item.color}-50 text-${item.color}-700 font-medium`
                        : 'text-gray-600 hover:bg-gray-50'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {sidebarOpen && <span className="text-sm">{item.label}</span>}
                </NavLink>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 p-6 max-w-[1400px]">
            <Outlet />
          </main>
        </div>

        {/* Footer */}
        <CompanyContact />
      </div>
    </AdminProvider>
  )
}

export default AdminLayout

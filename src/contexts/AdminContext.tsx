import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../firebase/config'
import { subscribeAllUsers } from '../firebase/firestore'

interface AdminContextType {
  users: any[]
  loading: boolean
  userRole: string | null
  navigate: ReturnType<typeof useNavigate>
}

const AdminContext = createContext<AdminContextType | null>(null)

export const useAdminContext = () => {
  const context = useContext(AdminContext)
  if (!context) {
    throw new Error('useAdminContext must be used within AdminProvider')
  }
  return context
}

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    // Subscribe to all users (common data)
    const unsubUsers = subscribeAllUsers(
      (data: any[]) => {
        setUsers(data)
        setLoading(false)
      },
      (err: any) => {
        console.error('Error loading users:', err)
        setLoading(false)
      }
    )

    // Get current user role
    const currentUser = auth.currentUser
    if (currentUser) {
      const userData = users.find((u: any) => u.email === currentUser.email)
      setUserRole(userData?.role || null)
    }

    return () => unsubUsers()
  }, [])

  const value = {
    users,
    loading,
    userRole,
    navigate
  }

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

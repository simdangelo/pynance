import { createContext, useContext, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { User } from "@/types/api"

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const { data: user, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: api.auth.me,
    retry: false,
  })

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.auth.login({ email, password }),
    onSuccess: (loggedInUser) => {
      queryClient.setQueryData(["me"], loggedInUser)
    },
  })

  const registerMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.auth.register({ email, password }),
  })

  const logoutMutation = useMutation({
    mutationFn: api.auth.logout,
    onSuccess: () => {
      queryClient.setQueryData(["me"], null)
      queryClient.clear()
    },
  })

  const value: AuthContextValue = {
    user: user ?? null,
    isLoading,
    login: async (email, password) => {
      await loginMutation.mutateAsync({ email, password })
    },
    register: async (email, password) => {
      await registerMutation.mutateAsync({ email, password })
      await loginMutation.mutateAsync({ email, password })
    },
    logout: async () => {
      await logoutMutation.mutateAsync()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
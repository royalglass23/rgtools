'use server'

import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'

type LoginResult = { error: string } | { redirectTo: string }

export async function loginAction(_: unknown, formData: FormData): Promise<LoginResult> {
  try {
    await signIn('credentials', {
      username: formData.get('username') as string,
      password: formData.get('password') as string,
      redirect: false,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Invalid username or password' }
    }
    throw error
  }
  return { redirectTo: '/' }
}

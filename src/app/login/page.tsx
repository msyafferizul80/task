'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Loader2, ArrowRight } from 'lucide-react'

export default function LoginPage() {
    const router = useRouter()
    const supabase = createClient()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        // Check for error messages passed via URL
        const params = new URLSearchParams(window.location.search);
        if (params.get('error') === 'inactive') {
            setError('Your session was terminated because your account is inactive or suspended.');
            // Clean up the URL
            router.replace('/login');
        }
    }, [router]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (authError) throw authError

            if (user) {
                // Check user's status in lv_profiles before allowing them in
                const { data: profile, error: profileError } = await supabase
                    .from('lv_profiles')
                    .select('status')
                    .eq('id', user.id)
                    .single()

                if (profileError) {
                    await supabase.auth.signOut()
                    throw new Error('Failed to verify user profile.')
                }

                if (profile?.status !== 'active') {
                    // Sign them out immediately
                    await supabase.auth.signOut()
                    throw new Error('Your account is inactive or suspended. Please contact the administrator.')
                }

                // Refresh to trigger middleware and go to dashboard
                router.refresh()
                router.push('/')
            }
        } catch (err: any) {
            setError(err.message || 'Authentication failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
            <div className="relative w-full max-w-md bg-white border border-gray-200 rounded-3xl p-8 shadow-xl overflow-hidden">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                        Task Management
                    </h1>
                    <p className="text-gray-500 mt-2 text-sm">Secure Login</p>
                </div>

                <form onSubmit={handleAuth} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider ml-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            placeholder="name@company.com"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider ml-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full group bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                Sign In
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    )
}

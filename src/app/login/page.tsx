'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Lock, AlertCircle } from 'lucide-react';

export default function LoginPage() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });

            if (res.ok) {
                router.push('/');
                router.refresh();
            } else {
                setError('密碼錯誤，請重試');
            }
        } catch {
            setError('連線失敗，請稍後再試');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50 p-4">
            <div className="w-full max-w-sm">
                <div className="glass-card p-8 shadow-xl">
                    {/* Logo */}
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4">
                            <Building2 size={32} className="text-white" />
                        </div>
                        <h1 className="text-xl font-bold text-slate-800 tracking-tight">TOWNPLACE SOHO</h1>
                        <p className="text-xs text-slate-400 tracking-widest mt-1">HANDOFF BRIDGE SYSTEM</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1.5 block">系統密碼</label>
                            <div className="relative">
                                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="請輸入密碼"
                                    className="input-field pl-10"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                                <AlertCircle size={14} className="text-red-500 shrink-0" />
                                <span className="text-xs text-red-700">{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !password}
                            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : '登入'}
                        </button>
                    </form>

                    <p className="text-[10px] text-slate-400 text-center mt-6">
                        預設密碼：townplace2024
                    </p>
                </div>
            </div>
        </div>
    );
}

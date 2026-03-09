import type { Config } from 'tailwindcss';

const config: Config = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                dept: {
                    eng: '#F59E0B',
                    'eng-light': '#FEF3C7',
                    conc: '#3B82F6',
                    'conc-light': '#DBEAFE',
                    clean: '#10B981',
                    'clean-light': '#D1FAE5',
                    hskp: '#10B981',
                    'hskp-light': '#D1FAE5',
                    mgmt: '#8B5CF6',
                    'mgmt-light': '#EDE9FE',
                    lease: '#EC4899',
                    'lease-light': '#FCE7F3',
                    comm: '#EF4444',
                    'comm-light': '#FEE2E2',
                    security: '#6B7280',
                    'security-light': '#F3F4F6',
                },
                status: {
                    done: '#10B981',
                    'done-light': '#D1FAE5',
                    progress: '#F59E0B',
                    'progress-light': '#FEF3C7',
                    pending: '#8B5CF6',
                    'pending-light': '#EDE9FE',
                    alert: '#EF4444',
                    'alert-light': '#FEE2E2',
                    na: '#9CA3AF',
                    'na-light': '#F3F4F6',
                },
            },
            fontFamily: {
                sans: ['Inter', 'Noto Sans TC', 'system-ui', 'sans-serif'],
            },
            animation: {
                'slide-in': 'slideIn 0.3s ease-out',
                'fade-in': 'fadeIn 0.2s ease-out',
                'pulse-gentle': 'pulseGentle 2s infinite',
            },
            keyframes: {
                slideIn: {
                    '0%': { transform: 'translateX(-10px)', opacity: '0' },
                    '100%': { transform: 'translateX(0)', opacity: '1' },
                },
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                pulseGentle: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.7' },
                },
            },
        },
    },
    plugins: [],
};

export default config;

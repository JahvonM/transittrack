/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		opacity: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [i, `${i / 100}`])),
  		// One radius scale: controls 10px, cards 14px, sheets/hero surfaces 18-22px.
  		borderRadius: {
  			sm: '6px',
  			md: '10px',
  			lg: 'var(--radius)',
  			xl: '16px',
  			'2xl': '18px',
  			'3xl': '22px'
  		},
  		boxShadow: {
  			sm: 'var(--shadow-1)',
  			DEFAULT: 'var(--shadow-1)',
  			md: 'var(--shadow-2)',
  			lg: 'var(--shadow-2)',
  			xl: 'var(--shadow-3)',
  			'2xl': 'var(--shadow-3)'
  		},
  		// Semantic type scale (min 12px). Tailwind's default sizes remain available.
  		fontSize: {
  			caption: ['0.75rem', { lineHeight: '1rem' }],
  			'body-sm': ['0.875rem', { lineHeight: '1.25rem' }],
  			body: ['1rem', { lineHeight: '1.5rem' }],
  			'title-sm': ['1.125rem', { lineHeight: '1.625rem', fontWeight: '600' }],
  			title: ['1.375rem', { lineHeight: '1.75rem', fontWeight: '700', letterSpacing: '-0.01em' }],
  			headline: ['1.75rem', { lineHeight: '2.125rem', fontWeight: '700', letterSpacing: '-0.015em' }],
  			display: ['2.25rem', { lineHeight: '2.5rem', fontWeight: '700', letterSpacing: '-0.01em' }],
  			hero: ['3.5rem', { lineHeight: '1', fontWeight: '700', letterSpacing: '-0.02em' }]
  		},
  		transitionDuration: {
  			fast: '120ms',
  			base: '180ms',
  			slow: '240ms'
  		},
  		transitionTimingFunction: {
  			'out-soft': 'cubic-bezier(.2,.8,.2,1)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			surface: {
  				'0': 'hsl(var(--surface-0))',
  				'1': 'hsl(var(--surface-1))',
  				'2': 'hsl(var(--surface-2))',
  				'3': 'hsl(var(--surface-3))'
  			},
  			success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--status-foreground))' },
  			warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--status-foreground))' },
  			danger: { DEFAULT: 'hsl(var(--danger))', foreground: 'hsl(var(--status-foreground))' },
  			info: { DEFAULT: 'hsl(var(--info))', foreground: 'hsl(var(--status-foreground))' },
  			offline: { DEFAULT: 'hsl(var(--offline))', foreground: 'hsl(var(--status-foreground))' },
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		fontFamily: {
  			heading: ['var(--font-heading)'],
  			body: ['var(--font-body)'],
  			display: ['var(--font-display)'],
  			mono: ['var(--font-mono)']
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}

const variants = {
  primary:
    'bg-nest text-white hover:bg-nest-light focus-visible:ring-nest',
  secondary:
    'border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 focus-visible:ring-gray-300',
  ghost:
    'text-gray-500 hover:text-gray-700 focus-visible:ring-gray-300',
}

export default function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type="button"
      className={`rounded-lg px-6 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

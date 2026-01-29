interface LogoProps {
  size?: 'sm' | 'lg'
}

export function Logo({ size = 'sm' }: LogoProps) {
  const isLarge = size === 'lg'
  return (
    <span className={isLarge ? 'text-3xl' : 'text-lg'}>
      <span style={{ fontFamily: 'Inter' }} className="font-medium">
        Agent
      </span>
      <span style={{ fontFamily: 'JetBrains Mono' }} className="font-extrabold">
        OP
      </span>
    </span>
  )
}

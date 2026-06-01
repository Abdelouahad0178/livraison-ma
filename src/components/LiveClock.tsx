import { useState, useEffect } from 'react'

interface LiveClockProps { className?: string }

export default function LiveClock({ className = '' }: Readonly<LiveClockProps>) {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    <span className={`font-mono tabular-nums text-xs select-none ${className}`}>
      {p(time.getHours())}:{p(time.getMinutes())}:{p(time.getSeconds())}
    </span>
  )
}

import type { Reaction } from '@/lib/types/report'
import Image from 'next/image'

const labels: Record<Reaction, [string, string]> = {
  idle: ['ready to review', 'siap menilai'], suspicious: ['curious; checking the evidence', 'penasaran; memeriksa bukti'],
  analyzing: ['examining your website', 'memeriksa websitemu'], shocked: ['surprised by the findings', 'kaget melihat temuannya'],
  laughing: ['having a laugh', 'sedang tertawa'], disappointed: ['not impressed yet', 'belum terkesan'], angry: ['the evidence is alarming', 'buktinya mengkhawatirkan'],
  impressed: ['impressed by the work', 'terkesan dengan hasilnya'], helpful: ['ready to help fix it', 'siap membantu perbaikan'], proud: ['approving nod', 'mengangguk setuju'],
}

export function Mascot({ small = false, state = 'idle', language = 'en' }: { small?: boolean; state?: Reaction; language?: 'en' | 'id' }) {
  return <div className={`mascot-wrap ${small ? 'mascot-small' : ''}`} data-state={state} key={state}><Image src="/bro-code.png" width={1408} height={768} unoptimized loading={small ? 'lazy' : 'eager'} fetchPriority={small ? 'auto' : 'high'} alt={`Bro Code: ${labels[state][language === 'id' ? 1 : 0]}`} /></div>
}

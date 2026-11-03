import type { Reaction } from '@/lib/types/report'
import Image from 'next/image'

type MascotState = Reaction | 'curious' | 'confused'

const labels: Record<MascotState, [string, string]> = {
  curious: ['curiosity mode', 'mode penasaran'], confused: ['needs a clearer signal', 'butuh sinyal yang jelas'],
  idle: ['ready to review', 'siap menilai'], suspicious: ['checking the evidence', 'memeriksa bukti'],
  analyzing: ['examining your website', 'memeriksa websitemu'], shocked: ['surprised by the findings', 'kaget melihat temuannya'],
  laughing: ['having a laugh', 'sedang tertawa'], disappointed: ['not impressed yet', 'belum terkesan'], angry: ['the evidence is alarming', 'buktinya mengkhawatirkan'],
  impressed: ['impressed by the work', 'terkesan dengan hasilnya'], helpful: ['ready to help fix it', 'siap membantu perbaikan'], proud: ['approving nod', 'mengangguk setuju'],
}

export function Mascot({ small = false, state = 'idle', language = 'en' }: { small?: boolean; state?: MascotState; language?: 'en' | 'id' }) {
  const mood = labels[state][language === 'id' ? 1 : 0]
  return <div className={`mascot-wrap ${small ? 'mascot-small' : ''}`} data-state={state} title={`Bro Code: ${mood}`}>
    <div className="mascot-art" key={state}>
      <Image src="/bro-code.png" width={1408} height={768} sizes={small ? '160px' : '(max-width: 800px) 300px, 390px'} loading={small ? 'lazy' : 'eager'} fetchPriority={small ? 'auto' : 'high'} alt={`Bro Code: ${mood}`} />
      <span className="crt-screen" aria-hidden="true" />
    </div>
    {!small && <span className="mascot-mood">{mood}</span>}
  </div>
}

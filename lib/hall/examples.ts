import type { HallCase } from './types'

export const hallExamples: HallCase[] = [
  {
    id: 'shame-velvet-trap',
    slug: 'shame-velvet-trap',
    sourceType: 'fictional-example',
    visibility: 'anonymous',
    collection: 'shame',
    targetKind: 'website',
    publicAlias: {
      en: 'Project Velvet Trap',
      id: 'Proyek Perangkap Beludru',
    },
    title: {
      en: 'The Escapeless Newsletter Overlay',
      id: 'Pop-up Newsletter Tanpa Jalan Keluar',
    },
    category: {
      en: 'User Experience & Accessibility',
      id: 'Pengalaman Pengguna & Aksesibilitas',
    },
    verdictHeadline: {
      en: 'Hostage Taking Is Not an Email Marketing Strategy',
      id: 'Menyandera Pengunjung Bukan Strategi Pemasaran Email',
    },
    verdictSummary: {
      en: 'In this fictional scenario, a newsletter dialog traps keyboard focus, ignores Escape, and makes its close button hard to see on mobile.',
      id: 'Dalam skenario fiktif ini, pop-up newsletter mengunci fokus keyboard, mengabaikan Escape, dan menyamarkan tombol tutup di layar ponsel.',
    },
    broCodeReaction: {
      en: 'Bro tried to read one paragraph and got trapped in a marketing eternity.',
      id: 'Bro cuma mau baca satu paragraf. Malah disandera newsletter.',
    },
    comedyHeat: 88,
    findings: [
      {
        id: 'finding-velvet-focus-trap',
        title: {
          en: 'Missing Keyboard Escape Handler',
          id: 'Tombol Escape Tidak Berfungsi',
        },
        category: {
          en: 'Accessibility',
          id: 'Aksesibilitas',
        },
        explanation: {
          en: 'Pressing the escape key does nothing, and pressing tab cycles exclusively through social media buttons without reaching a dismiss action.',
          id: 'Menekan tombol escape tidak berpengaruh apa-apa, dan menekan tab hanya berputar di tombol media sosial tanpa opsi menutup.',
        },
        roast: {
          en: 'Your dialog treats visitor attention like a maximum security prison sentence.',
          id: 'Bro, ini pop-up newsletter atau sel tahanan?',
        },
        remediation: {
          en: 'Attach an explicit escape key listener, restore focus to the trigger on close, and use native dialog mechanics.',
          id: 'Gunakan dialog bawaan yang mendukung Escape dan kembalikan fokus ke tombol pembuka saat dialog ditutup.',
        },
        severity: 'high',
        evidenceType: 'fictional-example',
      },
      {
        id: 'finding-velvet-low-contrast-close',
        title: {
          en: 'Invisible Dismiss Control',
          id: 'Tombol Tutup yang Nyaris Tidak Terlihat',
        },
        category: {
          en: 'UI',
          id: 'UI',
        },
        explanation: {
          en: 'The close button uses faint gray glyphs on an almost identical off-white modal background, falling far below standard visual contrast ratios.',
          id: 'Tombol tutup menggunakan simbol abu-abu samar di atas latar belakang modal putih gading yang hampir identik, jauh di bawah rasio kontras standar.',
        },
        roast: {
          en: 'Finding that close icon requires an archaeological expedition.',
          id: 'Menemukan ikon tutup itu membutuhkan ekspedisi arkeologi khusus.',
        },
        remediation: {
          en: 'Provide a prominent dismiss button with high contrast and an accessible textual label.',
          id: 'Sediakan tombol tutup yang menonjol dengan kontras tinggi dan label teks yang dapat diakses.',
        },
        severity: 'medium',
        evidenceType: 'fictional-example',
      },
    ],
    strengths: [
      {
        en: 'The fictional layout keeps the newsletter heading and form easy to distinguish.',
        id: 'Dalam contoh ini, judul newsletter dan formulirnya tetap mudah dibedakan.',
      },
    ],
    limitations: [
      {
        en: 'Fictional scenario modeling aggressive lead-generation overlays.',
        id: 'Skenario fiktif tentang pop-up pemasaran yang terlalu memaksa, bukan hasil audit situs nyata.',
      },
    ],
    publishedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'shame-monolith-matrix',
    slug: 'shame-monolith-matrix',
    sourceType: 'fictional-example',
    visibility: 'anonymous',
    collection: 'shame',
    targetKind: 'repository',
    publicAlias: {
      en: 'Monolith Matrix',
      id: 'Matriks Monolit',
    },
    title: {
      en: 'Circular Dependencies and Orphaned Packages',
      id: 'Ketergantungan Melingkar dan Paket Terlantar',
    },
    category: {
      en: 'Architecture & Git Hygiene',
      id: 'Arsitektur & Kebersihan Git',
    },
    verdictHeadline: {
      en: 'Every Workspace Imports Every Other Workspace',
      id: 'Setiap Ruang Kerja Mengimpor Ruang Kerja Lainnya',
    },
    verdictSummary: {
      en: 'Shared packages import private internal helpers from downstream web applications, causing cyclical module graphs, multi-gigabyte build artifacts, and endless build pipeline timeouts.',
      id: 'Paket bersama mengimpor fungsi internal dari aplikasi web hilir, menyebabkan grafik modul melingkar, artefak kompilasi multi-gigabita, dan batas waktu tunggu build yang terus berulang.',
    },
    broCodeReaction: {
      en: 'Bro pulled the repository and watched the laptop fan audition for a jet engine simulator.',
      id: 'Bro mengunduh repositori dan menyaksikan kipas laptop bernyanyi seperti mesin jet.',
    },
    comedyHeat: 84,
    findings: [
      {
        id: 'finding-monolith-cycles',
        title: {
          en: 'Bidirectional Package Graph Cycles',
          id: 'Siklus Grafik Paket Dua Arah',
        },
        category: {
          en: 'Architecture',
          id: 'Arsitektur',
        },
        explanation: {
          en: 'In this example, shared utilities import UI widgets that import the same utilities, making initialization order fragile and package boundaries unclear.',
          id: 'Dalam contoh ini, utilitas bersama mengimpor komponen UI yang mengimpor kembali utilitas tersebut. Urutan inisialisasi jadi rapuh dan batas paket tidak jelas.',
        },
        roast: {
          en: 'Even classic optical illusions have simpler loops than these dependency trees.',
          id: 'Ilusi optik klasik sekalipun memiliki pola lebih sederhana dibandingkan pohon ketergantungan ini.',
        },
        remediation: {
          en: 'Move shared contracts into an independent package that imports neither side, and enforce one-way dependency boundaries with lint rules.',
          id: 'Pindahkan kontrak bersama ke paket mandiri yang tidak mengimpor kedua sisi, lalu tegakkan arah dependensi lewat aturan lint.',
        },
        severity: 'high',
        evidenceType: 'fictional-example',
      },
      {
        id: 'finding-monolith-large-artifacts',
        title: {
          en: 'Build Output Committed to Source Control',
          id: 'Hasil Kompilasi Masuk ke Kontrol Versi',
        },
        category: {
          en: 'Git Hygiene',
          id: 'Kebersihan Git',
        },
        explanation: {
          en: 'Generated compilation bundles and minified intermediate chunks are committed directly into repository history, bloating checkout sizes.',
          id: 'Bundel kompilasi yang dihasilkan dan berkas sementara diunggah langsung ke riwayat repositori, memperbesar ukuran unduhan.',
        },
        roast: {
          en: 'Cloning this repo downloads five versions of history and three copies of generated bundles.',
          id: 'Mengkloning repositori ini terasa seperti mengunduh lima versi riwayat dan tiga salinan bundel hasil kompilasi.',
        },
        remediation: {
          en: 'Ignore generated output and stop tracking it. Consider history cleanup only after coordinating backups and any disruptive rewrite with collaborators.',
          id: 'Abaikan hasil build dan hentikan pelacakannya. Jika riwayat perlu dibersihkan, sepakati pencadangan dan dampak penulisan ulang bersama tim dulu.',
        },
        severity: 'medium',
        evidenceType: 'fictional-example',
      },
    ],
    strengths: [
      {
        en: 'Root automation scripts have clear task names and detailed terminal help text.',
        id: 'Skrip otomatisasi utama memiliki nama tugas yang jelas dan teks bantuan terminal yang lengkap.',
      },
    ],
    limitations: [
      {
        en: 'Fictional workspace structure illustrating circular build entanglement.',
        id: 'Struktur ruang kerja fiktif yang mengilustrasikan keterikatan build melingkar.',
      },
    ],
    publishedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'shame-registration-abyss',
    slug: 'shame-registration-abyss',
    sourceType: 'fictional-example',
    visibility: 'anonymous',
    collection: 'shame',
    targetKind: 'website',
    publicAlias: {
      en: 'Registration Labyrinth',
      id: 'Labirin Pendaftaran',
    },
    title: {
      en: 'The Vanishing Field Validation Void',
      id: 'Misteri Isian Formulir yang Lenyap',
    },
    category: {
      en: 'Functionality & UX',
      id: 'Fungsionalitas & Pengalaman Pengguna',
    },
    verdictHeadline: {
      en: 'Submitting Erases Twenty Minutes of Typing',
      id: 'Sekali Kirim Menghapus Dua Puluh Menit Ketikan Pengguna',
    },
    verdictSummary: {
      en: 'A multi-step onboarding wizard wipes every input field on validation failure without specifying which rule failed, leaving users with blank inputs and a cryptic red banner.',
      id: 'Panduan orientasi bertahap mengosongkan seluruh formulir saat validasi gagal tanpa memberitahu aturan mana yang dilanggar, menyisakan kolom kosong dan spanduk merah misterius.',
    },
    broCodeReaction: {
      en: 'Bro typed life history into a form and it disappeared like a magic trick.',
      id: 'Bro mengetik riwayat hidup ke formulir dan semuanya lenyap seperti sulap.',
    },
    comedyHeat: 91,
    findings: [
      {
        id: 'finding-abyss-wipe-on-error',
        title: {
          en: 'Destructive State Reset on Validation Failure',
          id: 'Isian Terhapus Saat Validasi Gagal',
        },
        category: {
          en: 'Functionality',
          id: 'Fungsionalitas',
        },
        explanation: {
          en: 'When client validation detects a minor discrepancy in postal formatting, the entire component tree resets to initial default empty values.',
          id: 'Saat validasi klien menemukan ketidakcocokan kecil pada format pos, seluruh data komponen direset kembali ke kondisi kosong awal.',
        },
        roast: {
          en: 'Nothing builds customer loyalty quite like vaporizing their hard work in half a second.',
          id: 'Tidak ada yang lebih menguji kesetiaan pelanggan selain melenyapkan usaha mereka dalam setengah detik.',
        },
        remediation: {
          en: 'Preserve field values, identify invalid controls, and move focus to a useful error summary or the first invalid field. Respect reduced-motion preferences when scrolling.',
          id: 'Pertahankan isian, tandai kolom bermasalah, dan arahkan fokus ke ringkasan galat atau kolom pertama yang perlu diperbaiki. Hormati preferensi pengurangan gerakan saat menggulir.',
        },
        severity: 'high',
        evidenceType: 'fictional-example',
      },
      {
        id: 'finding-abyss-generic-error',
        title: {
          en: 'Uninformative Top-Level Error Banner',
          id: 'Pesan Galat Umum Tanpa Petunjuk',
        },
        category: {
          en: 'UX',
          id: 'UX',
        },
        explanation: {
          en: 'The error state displays an ambiguous banner stating something went wrong without tying errors to specific input fields.',
          id: 'Kondisi galat menampilkan spanduk membingungkan yang menyatakan terjadi kesalahan tanpa menghubungkannya ke kolom isian tertentu.',
        },
        roast: {
          en: 'Telling users an error happened without explaining where is the software equivalent of a shrug.',
          id: 'Memberitahu pengguna ada kesalahan tanpa penjelasan ibarat mengangkat bahu sambil berlalu.',
        },
        remediation: {
          en: 'Associate inline error messages with form controls via descriptive labels and accessibility relationships.',
          id: 'Hubungkan pesan kesalahan baris dengan elemen formulir melalui label deskriptif dan atribut aksesibilitas.',
        },
        severity: 'medium',
        evidenceType: 'fictional-example',
      },
    ],
    strengths: [
      {
        en: 'Visual styling of custom input borders and typography is polished and modern.',
        id: 'Gaya visual batas kolom input kustom dan tipografinya terlihat rapi dan modern.',
      },
    ],
    limitations: [
      {
        en: 'Fictional multi-step registration workflow demonstrating state persistence pitfalls.',
        id: 'Alur registrasi fiktif bertahap yang mendemonstrasikan kelemahan persistensi data.',
      },
    ],
    publishedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'shame-fleet-direct',
    slug: 'shame-fleet-direct',
    sourceType: 'fictional-example',
    visibility: 'anonymous',
    collection: 'shame',
    targetKind: 'repository',
    publicAlias: {
      en: 'Direct To Production Fleet',
      id: 'Armada Langsung Ke Produksi',
    },
    title: {
      en: 'Branchless Commits and Bypassed Automation',
      id: 'Commit Tanpa Cabang dan Otomatisasi Terabaikan',
    },
    category: {
      en: 'Git Hygiene & Testing',
      id: 'Kebersihan Git & Pengujian',
    },
    verdictHeadline: {
      en: 'Main Branch Is a Live Scratchpad',
      id: 'Cabang Utama Berfungsi Seperti Catatan Uji Coba Langsung',
    },
    verdictSummary: {
      en: 'Developers commit force-pushed revisions directly to default production branches with single-character commit summaries, while automated test suites are permanently set to skip on push.',
      id: 'Pengembang mengunggah paksa revisi langsung ke cabang utama produksi dengan pesan satu huruf, sementara uji otomatis dimatikan secara permanen.',
    },
    broCodeReaction: {
      en: 'Bro treats production deployment like saving a draft notepad file on the desktop.',
      id: 'Bro memperlakukan rilis produksi seperti menyimpan draf berkas catatan di desktop.',
    },
    comedyHeat: 78,
    findings: [
      {
        id: 'finding-fleet-force-push',
        title: {
          en: 'Unprotected Main Branch and Force Overwrite Habits',
          id: 'Cabang Utama Tanpa Perlindungan dan Kebiasaan Tulis Paksa',
        },
        category: {
          en: 'Git Hygiene',
          id: 'Kebersihan Git',
        },
        explanation: {
          en: 'No branch protection rules exist on primary branches, permitting direct rewrites of shared deployment history without peer review.',
          id: 'Tidak ada aturan perlindungan pada cabang utama, mengizinkan penulisan ulang riwayat rilis bersama tanpa tinjauan rekan.',
        },
        roast: {
          en: 'Your commit history looks like random thoughts scattered across a whiteboard.',
          id: 'Riwayat commit Anda terlihat seperti coretan ide acak yang bertebaran di papan tulis.',
        },
        remediation: {
          en: 'Protect the default branch, require reviewed pull requests and passing checks, and restrict force pushes. Add commit signing where the team threat model calls for it.',
          id: 'Lindungi cabang utama, wajibkan review pull request dan pemeriksaan yang lulus, lalu batasi force push. Gunakan tanda tangan commit bila dibutuhkan oleh model ancaman tim.',
        },
        severity: 'high',
        evidenceType: 'fictional-example',
      },
      {
        id: 'finding-fleet-disabled-ci',
        title: {
          en: 'Automated Continuous Integration Skipped by Default',
          id: 'Integrasi Berkelanjutan Otomatis Dilewati Secara Bawaan',
        },
        category: {
          en: 'Testing',
          id: 'Pengujian',
        },
        explanation: {
          en: 'Continuous integration pipelines are configured with flags that skip test execution on every commit message matching quick updates.',
          id: 'Alur integrasi berkelanjutan dikonfigurasi dengan tanda yang melewatkan eksekusi pengujian pada setiap pembaruan cepat.',
        },
        roast: {
          en: 'Tests cannot fail if you never allow them to execute. Truly advanced engineering.',
          id: 'Pengujian tidak akan pernah gagal jika Anda tidak pernah menjalankannya. Rekayasa yang sungguh visioner.',
        },
        remediation: {
          en: 'Make unit and integration test suites mandatory gate checks before merging any pull request.',
          id: 'Jadikan pengujian unit dan integrasi sebagai syarat wajib sebelum menggabungkan pull request.',
        },
        severity: 'medium',
        evidenceType: 'fictional-example',
      },
    ],
    strengths: [
      {
        en: 'Rapid delivery cadence with concise internal utility functions.',
        id: 'Kecepatan pengiriman tinggi dengan fungsi utilitas internal yang ringkas.',
      },
    ],
    limitations: [
      {
        en: 'Fictional team workflow modeling absence of trunk stability controls.',
        id: 'Alur kerja tim fiktif yang memodelkan ketiadaan kendali stabilitas cabang utama.',
      },
    ],
    publishedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'vibes-canopy-docs',
    slug: 'vibes-canopy-docs',
    sourceType: 'fictional-example',
    visibility: 'anonymous',
    collection: 'vibes',
    targetKind: 'website',
    publicAlias: {
      en: 'Clean Canopy Docs',
      id: 'Dokumentasi Kanopi Rapi',
    },
    title: {
      en: 'Instant Search and Pristine Reading Ergonomics',
      id: 'Pencarian Instan dan Ergonomi Membaca yang Nyaman',
    },
    category: {
      en: 'Accessibility & Performance',
      id: 'Aksesibilitas & Performa',
    },
    verdictHeadline: {
      en: 'Zero Clutter and Thoughtful Keyboard Navigation',
      id: 'Bebas Kekacauan dan Navigasi Papan Ketik yang Matang',
    },
    verdictSummary: {
      en: 'This fictional documentation site prioritizes readable contrast, useful keyboard shortcuts, and clear navigation. It illustrates good patterns, not measured performance results.',
      id: 'Situs dokumentasi fiktif ini mengutamakan kontras yang terbaca, pintasan keyboard yang berguna, dan navigasi yang jelas. Ini ilustrasi praktik baik, bukan hasil pengukuran performa.',
    },
    broCodeReaction: {
      en: 'Bro took one look and smiled. Finally, someone respects developer reading eyesight.',
      id: 'Bro melihat sekali dan tersenyum. Akhirnya, ada yang peduli dengan kesehatan mata pengembang.',
    },
    comedyHeat: 12,
    findings: [
      {
        id: 'finding-canopy-accessible-shortcuts',
        title: {
          en: 'Exemplary Focus Management and Search Shortcuts',
          id: 'Manajemen Fokus dan Pintasan Pencarian Teladan',
        },
        category: {
          en: 'Accessibility',
          id: 'Aksesibilitas',
        },
        explanation: {
          en: 'Standard keyboard combinations instantly focus search without modal jitter, displaying clear visual breadcrumbs and highlighting active headings.',
          id: 'Pintasan keyboard mengarahkan fokus ke pencarian tanpa mengganggu tampilan, dengan penunjuk lokasi halaman dan judul aktif yang jelas.',
        },
        roast: {
          en: 'It is almost unsettling how pleasant this is. We had to double-check to make sure it was really documentation.',
          id: 'Hampir tidak biasa melihat dokumentasi senyaman ini. Kami sampai harus memeriksa ulang untuk memastikan ini benar dokumentasi.',
        },
        remediation: {
          en: 'Keep focus order predictable, avoid trapping focus outside modal dialogs, and test translated accessible names with screen readers.',
          id: 'Jaga urutan fokus tetap jelas, jangan kunci fokus di luar dialog modal, dan uji nama aksesibel yang diterjemahkan dengan pembaca layar.',
        },
        severity: 'low',
        evidenceType: 'fictional-example',
      },
    ],
    strengths: [
      {
        en: 'The example keeps the reading layout lightweight and avoids unnecessary interface clutter.',
        id: 'Contoh ini menjaga tampilan bacaan tetap ringan tanpa elemen antarmuka yang tidak perlu.',
      },
      {
        en: 'Clear page landmarks and predictable keyboard navigation are part of the fictional design.',
        id: 'Struktur halaman yang jelas dan navigasi keyboard yang teratur menjadi bagian dari desain fiktif ini.',
      },
    ],
    limitations: [
      {
        en: 'Fictional documentation site highlighting high-contrast accessibility patterns.',
        id: 'Situs dokumentasi fiktif yang menonjolkan pola aksesibilitas berorientasi kontras tinggi.',
      },
    ],
    publishedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'vibes-prism-core',
    slug: 'vibes-prism-core',
    sourceType: 'fictional-example',
    visibility: 'anonymous',
    collection: 'vibes',
    targetKind: 'repository',
    publicAlias: {
      en: 'Prism Core Utilities',
      id: 'Utilitas Inti Prisma',
    },
    title: {
      en: 'Strict Type Boundaries and Deterministic Test Runners',
      id: 'Batasan Tipe Ketat dan Pelaksana Uji Deterministik',
    },
    category: {
      en: 'Code Quality & Architecture',
      id: 'Kualitas Kode & Arsitektur',
    },
    verdictHeadline: {
      en: 'Tests, Types, and Boundaries That Actually Help',
      id: 'Tes, Tipe, dan Batas Modul yang Benar-Benar Membantu',
    },
    verdictSummary: {
      en: 'A fictional library separates pure domain logic from external services, checks important behavior with deterministic tests, and documents its type contracts.',
      id: 'Pustaka fiktif ini memisahkan logika domain murni dari layanan eksternal, menguji perilaku penting secara deterministik, dan mendokumentasikan kontrak tipenya.',
    },
    broCodeReaction: {
      en: 'Bro wanted to find something to roast but ended up starring the fictional repo instead.',
      id: 'Bro berniat mencari celah roasting tetapi malah berakhir memberi bintang pada repositori fiktif ini.',
    },
    comedyHeat: 18,
    findings: [
      {
        id: 'finding-prism-pure-boundaries',
        title: {
          en: 'Pure Functional Core with Isolated Side-Effect Adapters',
          id: 'Inti Fungsional Murni dengan Adaptor Efek Samping Terisolasi',
        },
        category: {
          en: 'Architecture',
          id: 'Arsitektur',
        },
        explanation: {
          en: 'All domain computation logic remains completely detached from environment-specific input/output operations, enabling ultra-fast in-memory test execution.',
          id: 'Seluruh logika komputasi domain terlepas dari operasi input/output spesifik lingkungan, memungkinkan eksekusi uji dalam memori yang sangat cepat.',
        },
        roast: {
          en: 'The code is so clean you could eat dinner off the call stack.',
          id: 'Bro mau roasting, tapi kodenya malah lebih rapi daripada meja kerja sendiri.',
        },
        remediation: {
          en: 'Keep dependencies minimal and continue documenting architectural decisions in concise changelogs.',
          id: 'Pertahankan dependensi seminimal mungkin dan terus dokumentasikan keputusan arsitektur di catatan rilis ringkas.',
        },
        severity: 'low',
        evidenceType: 'fictional-example',
      },
    ],
    strengths: [
      {
        en: 'The example tests success and failure paths without relying on live services or timing guesses.',
        id: 'Contoh ini menguji jalur berhasil maupun gagal tanpa bergantung pada layanan langsung atau tebakan waktu.',
      },
      {
        en: 'Comprehensive changelog with semver versioning and zero runtime dependencies.',
        id: 'Catatan perubahan komprehensif dengan versi semver dan nol dependensi runtime.',
      },
    ],
    limitations: [
      {
        en: 'Fictional library codebase demonstrating decoupled architectural isolation.',
        id: 'Repositori pustaka fiktif yang mendemonstrasikan isolasi arsitektur terpisah.',
      },
    ],
    publishedAt: '2026-11-01T00:00:00.000Z',
  },
]

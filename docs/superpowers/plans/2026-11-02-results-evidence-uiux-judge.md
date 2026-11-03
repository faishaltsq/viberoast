# Results Evidence and UI/UX Judge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans only after the owner approves this plan. Steps use checkbox syntax for tracking. This document does not authorize implementation, testing, commits, or deployment.

**Goal:** Memperhalus preview screenshot, menjadikan error browser sebagai bukti yang berguna, dan menambahkan judge UI/UX dengan LLM skill tanpa mengarang masalah atau mengubah identitas VibeRoast.

**Architecture:** Scanner tetap menjadi sumber bukti browser/DOM. Satu completion LLM yang sudah ada menghasilkan roast dan observasi visual terbatas dari screenshot yang benar-benar dikirim. Server memvalidasi dan menggabungkan temuan; Results, Fix My Shame, prompt, dan PNG memakai laporan gabungan yang sama.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS Modules, Playwright worker, Zod, existing DeepSeek-compatible integration, Vitest, Playwright E2E. Tidak menambah dependency.

**Spec:** Permintaan pemilik pada percakapan ini: sembunyikan scrollbar screenshot tetapi pertahankan scroll; jelaskan/perbaiki findings kosong saat ada browser errors; tambahkan judge UI/UX dan LLM skill; gunakan Antislop; buat plan dahulu. Batas visual dan evidence tetap mengikuti `docs/POLISH.md`.

## Status dan batas pekerjaan

- **Hanya plan.** Implementasi aktif sudah dihentikan.
- **Origin selesai menurut pemilik.** Tidak ada investigasi, perubahan, atau pengecekan ulang origin dalam plan ini.
- Draft perubahan lokal sempat dibuat sebelum instruksi plan-first. Draft tersebut belum di-commit atau diverifikasi untuk fitur-fitur ini; jangan dianggap selesai atau siap deploy.
- Saat implementasi disetujui, mulai dengan membedakan draft milik pekerjaan ini dari perubahan pengguna yang sudah ada, lalu cocokkan draft terhadap plan. Jangan menimpa atau membuang perubahan lain.
- Dalam plan ini, **LLM skill** berarti modul rubrik/instruksi versioned di server VibeRoast, bukan installer atau konfigurasi global Hermes/Codex. Definisi ini perlu disetujui bersama plan.

## Global Constraints

- Preserve the design. Tidak redesign, mengganti Bro Code, mengganti palette, atau menambahkan dashboard/template baru.
- Antislop tetap dalam mode `during` yang sudah terselesaikan dari global preference. Tidak memasang ulang skill atau mengubah AGENTS.md secara diam-diam.
- Pertahankan paper/ink/muted red/terminal green, editorial hierarchy, borders dan offset shadows. ENERGY 3 / RHYTHM 3 / MOTION 2 tetap menjadi arah produk; perubahan ini tidak menambah animasi.
- Tidak ada request scanner baru yang melewati proxy/isolation, klik/form submission otomatis, bypass bot protection, atau pelonggaran privasi.
- Jangan mengubah jumlah console error menjadi klaim tombol rusak, kerentanan, atau website tidak berfungsi tanpa bukti pendukung.
- Observasi AI visual selalu dibedakan dari bukti scanner terverifikasi.
- Tidak ada skor audit UI/UX numerik baru, persentase kualitas, hasil WCAG palsu, atau benchmark performa dari screenshot.
- Tidak ada dependency atau provider baru, tidak ada call AI kedua hanya untuk judge, tidak ada live AI call dalam CI biasa.
- Tidak merge, push, deploy frontend, atau redeploy worker tanpa izin terpisah.

## Review Focus

1. Error yang disebabkan kebijakan scanner tidak boleh menjadi tuduhan bug website. Task 2 menguji policy abort, scan-budget, teardown, dan proxy uncertainty.
2. LLM tidak boleh menilai viewport yang screenshot-nya tidak dikirim atau tidak tersedia. Task 3 menguji no-image, no-vision, dan viewport mismatch.
3. Screenshot yang scrollbar-nya tidak terlihat harus tetap bisa dinavigasi dengan keyboard, wheel, dan touch. Task 1 menguji overflow nyata dari fixture gambar tinggi.
4. Temuan AI tidak boleh menjadi verified, menyisipkan kategori Security/Functionality, mengganti rekomendasi scanner, atau membuat ID tidak dikenal. Task 3 dan 4 menguji batas kontrak tersebut.
5. Findings baru harus benar-benar masuk ke Results, pilihan perbaikan, prompt, dan export, bukan hanya disebut di verdict. Task 4 menguji satu laporan gabungan sepanjang flow.

## Peta file

| Area | File | Tanggung jawab |
| --- | --- | --- |
| Preview | `components/roast/results.tsx` | Region screenshot focusable dan berlabel; tampilan provenance findings |
| Preview styling | `components/roast/results-hall.module.css` | Scrollbar tersembunyi secara lokal, overflow tetap aktif, focus terlihat |
| Scanner | `worker/scan.ts` | Menghubungkan event browser ke pencatatan evidence, menjaga policy/viewport gates |
| Browser evidence | `worker/browser-evidence.ts` | Bounded capture, redaction, deduplication, attribution, dan conversion ke Finding |
| LLM skill | `lib/ai/skills/uiux.ts` | Rubrik UI/UX versioned sebagai trusted prompt source |
| Provider validation | `lib/ai/deepseek.ts` | Output visual terstruktur dalam completion yang sama, validasi provenance dan ID |
| Report integration | `app/api/roast/route.ts` | Menggabungkan findings sebelum retention/response |
| Regression | `tests/browser-evidence.test.ts`, `tests/ai.test.ts`, `tests/api.test.ts` | Attribution, schema, privacy, dan report integration |
| Browser regression | `e2e/browser-evidence.spec.ts`, `e2e/results-polish.spec.ts`, `e2e/product.spec.ts` | Bukti browser nyata dari fixture dan flow UI |
| Documentation | `docs/POLISH.md`, `worker/README.md` | Evidence limitations, LLM skill contract, dan rollout requirements |

Existing `Finding`/`RoastReport` schema dipakai kembali sejauh memungkinkan. Tidak perlu model laporan kedua atau metric schema baru untuk fitur ini.

---

## Task 1: Scrollbar preview tidak terlihat, scrolling tetap berfungsi

**Consumes:** Screenshot desktop/mobile dari report yang sudah ada.

**Produces:** Preview screenshot dengan native scrolling, accessible region, dan visible keyboard focus.

- [ ] Tambahkan fixture screenshot tinggi ke test browser. Fixture harus memiliki `scrollHeight > clientHeight`, agar test membuktikan scrolling sungguhan.
- [ ] Tulis regresi yang memfokuskan preview dan menekan `PageDown`, kemudian memastikan posisi scroll berubah. Tambahkan wheel test dan viewport 390px.
- [ ] Terapkan CSS hanya pada preview, bukan scrollbar body, prompt, atau semua elemen:

```css
.results .screenshot { scrollbar-width: none; }
.results .screenshot::-webkit-scrollbar { display: none; }
.results :global(.site-shot):focus-within {
  outline: 3px solid var(--ink);
  outline-offset: 4px;
}
```

- [ ] Region screenshot memakai `role="region"`, label desktop/mobile, dan `tabIndex={0}`. Pertahankan `overflow: auto`; jangan memakai `overflow: hidden` untuk menyembunyikan scrollbar.
- [ ] Jalankan regresi preview dan smoke desktop/mobile setelah persetujuan.

**Acceptance:** Track/thumb scrollbar tidak terlihat; wheel, keyboard, dan touch scrolling tidak diblokir; border/focus tetap terlihat; tidak ada horizontal document overflow atau perubahan layout yang tidak diminta.

**Planned check:** `pnpm exec playwright test e2e/results-polish.spec.ts` dengan channel browser yang sudah terpasang.

## Task 2: Browser errors menjadi findings yang punya receipts

**Masalah yang sudah ditemukan:** Listener saat ini hanya menaikkan `metrics.consoleErrors` dan `metrics.failedRequests`. `buildFindings()` menilai DOM saja. Maka 8 console errors dan 4 failed requests dapat tampil bersama 0 findings. Ini gap pencatatan, bukan alasan untuk mengarang kegagalan fitur.

**Consumes:** Event `console.error`, `pageerror`, dan `requestfailed`, viewport, URL/reason yang sudah disanitasi, serta penanda pembatasan scanner.

**Produces:** `Finding[]` browser yang bounded, deduplicated, ber-ID stabil, beserta diagnostic context untuk event yang tidak pantas dituduhkan kepada website.

- [ ] Definisikan penanda sebab event: website-observed, scanner-policy, scan-budget, teardown, dan unknown. Counter total tetap tersedia; klasifikasi tidak boleh menyembunyikan keterbatasan scan.
- [ ] Tulis fixture untuk exception JavaScript yang disengaja, console error dengan lokasi, resource failure yang sungguhan, dan request yang sengaja ditolak scanner.
- [ ] Simpan detail secukupnya: jenis event, viewport, lokasi, pesan/reason, serta URL yang telah diredaksi. Batasi panjang teks, jumlah event, dan duplikasi sebelum masuk report atau provider.
- [ ] Buat temuan atas observasi nyata. Contoh semantik:
  - Exception observed: exception memang tercatat; dampaknya pada alur pengguna belum dibuktikan.
  - Resource request failed: resource dan failure reason tercatat; perlu reproduksi untuk memastikan dampak.
  - Console error observed: pesan aktual dapat ditinjau; bukan otomatis bukti seluruh aplikasi rusak.
- [ ] Pisahkan abort akibat proxy policy, read-only restriction, redirect/request budget, atau penutupan context. Event seperti ini menjadi diagnostic/limitation, bukan confirmed website defect.
- [ ] Terapkan gate challenge/unavailable viewport yang sama dengan DOM findings.
- [ ] Uji redaction, duplikasi, batas capture, viewport eligibility, dan noise yang URL penyebabnya tidak diketahui. Ketidakpastian harus tetap ditampilkan.

**Acceptance:** Error yang relevan menghasilkan kartu evidence yang bisa ditindaklanjuti. Jika semua error berasal dari pembatasan scanner, findings boleh tetap kosong, tetapi alasannya jelas pada diagnostics/limitations. Tidak ada temuan hanya untuk menaikkan jumlah roast.

**Planned checks:**

```text
pnpm exec vitest run tests/browser-evidence.test.ts
pnpm exec playwright test e2e/browser-evidence.spec.ts
```

## Task 3: LLM skill dan judge UI/UX berbasis screenshot

**Consumes:** Scan evidence, actual desktop/mobile JPEG yang lolos privacy guard, language, dan roast intensity.

**Produces:** Rubrik versioned dan observasi visual terstruktur dalam satu completion yang sudah ada.

### Rubrik LLM skill

- [ ] Buat modul trusted instruction dengan nama, versi, dan batas kemampuan di `lib/ai/skills/uiux.ts`.
- [ ] Rubrik mencakup hierarchy/focal point, readability, spacing/alignment, visible action affordance, viewport fit, serta konsistensi terhadap brand yang benar-benar terlihat.
- [ ] Gunakan Antislop sebagai filter kualitas, bukan template untuk memaksakan style baru ke website yang dianalisis.
- [ ] Larang klaim fungsi tombol, source code, framework, keamanan, performa, hasil audit aksesibilitas, atau keadaan UI yang tidak terlihat/tercatat.
- [ ] Rekomendasi harus spesifik terhadap region yang diamati dan mempertahankan bagian yang sudah bekerja. Jangan mengeluarkan daftar kritik template untuk setiap scan.

### Kontrak output

Tetap satu completion, dengan keluaran yang direncanakan:

```ts
Promise<{
  commentary: Commentary
  visualAnalysis: boolean
  visualFindings: Finding[]
}>
```

- [ ] Tambahkan required `visualFindings` pada generated JSON; output tanpa observasi menggunakan `[]` secara eksplisit.
- [ ] Batasi maksimal enam observasi visual dan maksimal 60 combined findings. Server menyediakan ID unik yang tidak berbenturan dengan scanner IDs.
- [ ] Setiap observasi menyebut viewport yang dikirim, region, pengamatan konkret, dan rekomendasi. Server menetapkan `source: 'browser'` dan `verification: 'heuristic'` untuk observasi AI.
- [ ] Batasi visual category ke UI/UX dan confidence/severity ke low/medium. Jangan mengizinkan output AI menaikkan dirinya menjadi verified.
- [ ] Tanpa vision capability atau tanpa screenshot yang valid, `visualFindings` wajib kosong. Tidak menilai screenshot yang ditahan karena privasi.
- [ ] Pertahankan exact ID mapping untuk seluruh scanner findings, canonical scanner explanations/recommendations, redaction, batas output, cancellation, dan retry budget.
- [ ] Tambahkan deterministic provider fixtures untuk valid visual evidence, unavailable viewport, kategori terlarang, spoofed verification, ID collision, unknown/duplicate IDs, over-limit output, redaction, serta good-result empty output.

**Acceptance:** Judge memberi kritik UI/UX yang spesifik dan berguna jika ada bukti visual. Ia mampu tidak menemukan masalah. Interpretasi visual tidak disamakan dengan fakta teknis terverifikasi atau sertifikasi kualitas.

**Planned check:** `pnpm exec vitest run tests/ai.test.ts`; gunakan schema/property assertions, bukan exact joke wording atau paid provider calls.

## Task 4: Satu laporan gabungan untuk Results dan Fix Mode

**Consumes:** Scanner findings dan validated visual findings dari Task 2/3.

**Produces:** Report yang konsisten untuk Results, Fix My Shame, agent prompt, comedy meter, dan export.

- [ ] Gabungkan validated visual findings ke `scan.findings` sebelum retention dan API response. Commentary harus menunjuk ID pada laporan gabungan yang sama.
- [ ] Update deterministic API fixtures mengikuti kontrak baru, tanpa compatibility shim yang menutupi provider output tidak valid.
- [ ] Pada kartu findings, bedakan sumber scanner/browser event dan AI visual review melalui label/evidence. Jangan hanya mengandalkan warna.
- [ ] Uji bahwa temuan baru bisa dibuka, dipilih, dibawa ke prompt perbaikan, dan diekspor tanpa kehilangan evidence/recommendation.
- [ ] Pertahankan scanner-only report saat AI gagal. Tidak ada visual findings palsu untuk mengisi kekosongan provider.
- [ ] Perjelas empty state saat ada diagnostics tetapi tidak ada assessed findings. Jangan menyebut zero findings sebagai bukti website sehat.
- [ ] Pertahankan disclosure bahwa roast heat adalah comedy issue-density indicator, bukan nilai UI/UX, keamanan, atau performa.

**Acceptance:** Masalah yang disebut di verdict dan memang diterima sebagai finding memiliki kartu serta fix target yang sesuai. Tidak ada temuan yang hanya hidup di headline AI tetapi hilang dari report.

**Planned checks:** `tests/api.test.ts`, `tests/prompts.test.ts`, dan browser flow Results → issue selection → prompt → Markdown/PNG dengan deterministic report.

## Task 5: Verifikasi dan handoff setelah persetujuan

- [ ] Jalankan unit/integration regression yang relevan, TypeScript, lint, build, dan browser regression. Ini tidak mencakup investigasi atau smoke ulang origin.
- [ ] Exercise preview scroll, findings expansion, issue selection, prompt generation, clipboard/download, dan empty/error/scanner-only states.
- [ ] Smoke Results/Fix Mode pada 360, 390, 430, 768, 1024, dan 1440px; periksa focus, overflow, reduced motion, dan palette contrast untuk elemen yang berubah.
- [ ] Jalankan Antislop delivery gate pada changed surface dengan bukti, bukan sekadar checklist PASS.
- [ ] Pisahkan commit preview, browser evidence, judge/skill integration, dan verification documentation. Jangan ikut men-stage perubahan pengguna yang tidak terkait.
- [ ] Dokumentasikan rollout: perubahan worker memerlukan worker deployment dan scan baru; perubahan frontend/provider membutuhkan deployment app. Laporan lama tidak otomatis diperbarui.
- [ ] Minta izin deployment secara terpisah. Sampai ada izin, serahkan kode/commit dan bukti lokal tanpa mengubah staging/production.

## Urutan eksekusi yang diusulkan

1. Preview scrollbar dan keyboard access.
2. Browser evidence attribution dan findings.
3. Versioned LLM skill serta structured UI/UX judge.
4. Integrasi laporan, Results, Fix Mode, dan export.
5. Regression, visual smoke, Antislop gate, dokumentasi, dan review commit.

**Approval gate:** Tunggu konfirmasi pemilik atas scope dan arti LLM skill sebelum melanjutkan implementasi. Tidak ada feature completion atau hasil test baru yang diklaim oleh plan ini.

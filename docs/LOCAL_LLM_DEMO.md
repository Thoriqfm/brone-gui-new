# Demo lokal: LLM JSON ke wajah Brone

Service tim LLM bertindak sebagai pengirim HTTP. Backend Brone memvalidasi JSON,
menyimpan state terbaru, lalu mengirimkannya ke frontend lewat WebSocket.
Log bukan sumber input; service pengirim harus memanggil endpoint.

## Menjalankan

Jika dependency sudah terpasang, cukup jalankan `npm.cmd run dev` dari root repository
(`npm run dev` di Linux/macOS). Frontend dan backend berjalan dalam satu terminal,
WebSocket lokal langsung aktif, dan Ctrl+C menghentikan keduanya. Hentikan dulu
server yang sebelumnya dijalankan terpisah di port 8000/5173.

Untuk setup pertama atau menjalankan layanan secara terpisah:

Dari root repository, buka dua terminal PowerShell.

Terminal backend (gunakan satu worker):

```powershell
cd backend
# Untuk setup pertama:
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --log-level info --log-config ../scripts/backend-logging.json
```

Terminal frontend:

```powershell
cd frontend
npm.cmd install
# Pastikan frontend/.env.local berisi dua baris berikut:
# VITE_WS_ENABLED=true
# VITE_WS_URL=ws://127.0.0.1:8000/ws/face
npm.cmd run dev -- --port 5173 --strictPort
```

Restart Vite setelah mengubah environment. Buka http://127.0.0.1:5173 dan tekan
`H` untuk melihat kontrol. Status harus `Backend connected`.

## Mengirim ekspresi tanpa LLM

Buka http://127.0.0.1:8000/docs. Pilih `POST /api/face/expression`, klik
`Try it out`, isi JSON berikut, lalu `Execute`:

```json
{
  "type": "SET_EXPRESSION",
  "request_id": "local-demo-001",
  "payload": {
    "emotion": "happy"
  }
}
```

Atau dari terminal PowerShell ketiga di root repository:

```powershell
function Send-Face([string]$Emotion) {
    $body = @{
        type = 'SET_EXPRESSION'
        request_id = [guid]::NewGuid().ToString()
        payload = @{ emotion = $Emotion }
    } | ConvertTo-Json -Depth 3
    Invoke-RestMethod -Uri http://127.0.0.1:8000/api/face/expression -Method Post -ContentType 'application/json' -Body $body
}
Send-Face thinking
Send-Face happy
Send-Face sad
Send-Face timeout
Send-Face idle
```

Jalankan satu command, lalu lihat wajah sebelum menjalankan command berikutnya.
Ekspresi valid: `idle`, `happy`, `happier`, `sad`, `cry`, `shock`, `thinking`, `timeout`.
`transition_ms` adalah durasi transisi, bukan waktu wajah bertahan.
Jika tidak dikirim, backend memakai `intensity: 1` dan `transition_ms: 700`.
Keduanya tetap boleh dikirim untuk override, termasuk `0`. Nilai `null` ditolak.
Backend selalu mengirim kedua field lengkap ke frontend.
Intensitas divalidasi dan disimpan, tetapi belum memengaruhi visual.

## Kontrak dengan tim LLM

- Kirim `POST http://127.0.0.1:8000/api/face/expression` dengan `Content-Type: application/json` dan format di atas. Alamat loopback berlaku jika pengirim berada di komputer yang sama.
- Jangan tambahkan teks jawaban atau metadata ke envelope ini; kirim hanya command wajah.
- Respons HTTP 200: `{"status":"accepted","request_id":"local-demo-001","connected_clients":1}`. Ini bukan acknowledgment bahwa animasi selesai atau terlihat di layar.
- JSON invalid menghasilkan HTTP 422 tanpa mengubah state; origin browser yang tidak diizinkan menghasilkan 403.
- `GET /api/face/state` membaca command terakhir yang diterima backend. Ini bisa berbeda dari tampilan jika pengguna memilih ekspresi manual di frontend.
- Backend mencatat `request_id`, ekspresi, dan jumlah koneksi melalui logger `app.services.face_command`.
- Kirim `thinking` sebelum menunggu LLM, ekspresi jawaban sesudah berhasil, `timeout` ketika batas waktu habis, dan ekspresi pemulihan secara eksplisit. Backend belum mendeteksi timeout LLM.
- Command valid terbaru menggantikan state sebelumnya; tidak ada antrean playback atau deduplikasi berdasarkan `request_id`.

## Memeriksa reconnect dan kegagalan

1. Kirim `sad`, lalu refresh browser: wajah kembali ke `sad` dari state backend.
2. Tutup tab wajah, kirim `happy`, lalu buka lagi: wajah menerima `happy`.
3. Kirim `emotion: "unknown"`: HTTP 422, state tetap sama.
4. Matikan backend: UI menampilkan disconnected. Jalankan backend kembali: frontend mencoba reconnect setiap 1,5 detik dan menerima state awal `idle`.
5. Jika respons `connected_clients` nol, cek Vite environment, restart Vite, dan pastikan halaman wajah terbuka. Cek `/health` untuk memastikan backend hidup.

State berada di memori satu proses dan hilang saat restart. Jangan memakai banyak
worker. Backend ini untuk loopback lokal, belum memiliki autentikasi; jangan
mengubah host menjadi `0.0.0.0` untuk akses tim dari jaringan sebelum menambahkan
autentikasi dan pengaturan origin yang sesuai.

## Verifikasi

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
```

```powershell
cd frontend
npm.cmd run typecheck
npm.cmd run build
# Dengan backend aktif, verifikasi transport asli sampai state frontend:
node scripts/verify-live-face-integration.mjs
```

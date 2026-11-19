import Image from "next/image";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 bg-[#26231f] text-[#f3ede2]">
      <div className="mx-auto max-w-[75rem] px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="space-y-3">
            <h2 className="font-[family-name:var(--font-jakarta)] text-lg font-bold text-white">
              Ensiklopedia Digital Megalitik Banyuwangi
            </h2>
            <p className="text-sm leading-relaxed text-[#efeae2]">
              Sumber belajar budaya megalitik Banyuwangi untuk siswa kelas III
              dan IV SD serta pendampingan guru.
            </p>
            <p className="text-xs leading-relaxed text-[#d6cec1]">
              Peta hanya menampilkan perkiraan wilayah umum untuk melindungi
              kelestarian tinggalan arkeologi.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-base font-bold text-white">Tautan Penting</h3>
            <ul className="flex list-none flex-col gap-2 p-0 text-sm">
              <li>
                <Link href="/tentang" className="text-[#f3ede2] underline">
                  Tentang &amp; Tim Penyusun
                </Link>
              </li>
              <li>
                <Link href="/unduhan" className="text-[#f3ede2] underline">
                  Pusat Unduhan
                </Link>
              </li>
              <li>
                <Link href="/guru" className="text-[#f3ede2] underline">
                  Portal Guru
                </Link>
              </li>
              <li>
                <Link href="/tentang#privasi" className="text-[#f3ede2] underline">
                  Kebijakan Privasi &amp; Koreksi Konten
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-base font-bold text-white">Pengelola &amp; Dukungan</h3>
            <p className="text-sm text-[#efeae2]">
              Pengelola: [Nama Pengelola Resmi — belum diisi]
              <br />
              Kontak privasi: [Email Kontak Privasi — belum diisi]
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Image
                src="/images/logos/kemenbud-01-white.webp"
                alt="Logo Kementerian Kebudayaan"
                width={640}
                height={350}
                className="h-10 w-auto object-contain"
              />
              <Image
                src="/images/logos/lpdp-white.webp"
                alt="Logo LPDP"
                width={640}
                height={320}
                className="h-10 w-auto object-contain"
              />
              <Image
                src="/images/logos/dana-indonesiana-white.webp"
                alt="Logo Dana Indonesiana"
                width={640}
                height={157}
                className="h-10 w-auto object-contain"
              />
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-white/15 pt-6 text-xs text-[#d6cec1]">
          <p>
            © {new Date().getFullYear()} Ensiklopedia Digital Megalitik
            Banyuwangi. Disiapkan sesuai spesifikasi PRD v1.0.
          </p>
        </div>
      </div>
    </footer>
  );
}

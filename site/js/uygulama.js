// Katılımcı uygulamasının giriş noktası: deney akışını yönetir.
//
//   onam → anket → (katılımcı oluşturma) → alıştırma + 6 deneme
//        → tercih sorusu → gönderim → teşekkür
//
// İlerleme her adımda localStorage'a yazılır (js/durum.js); sayfa yenilenirse
// katılımcı kaldığı yerden devam eder.

import { el } from './ekran.js';
import { tarayicida_tespit_et } from './cihaz.js';
import {
  durumu_oku, durumu_yaz, durumu_sil, yeni_durum, katilimci_atandi, adim_degisti,
  sonraki_deneme, yeniden_acilista_duzelt, gecerli_deneme, tamamlanma_kaydi, tamamlandi_isaretle,
} from './durum.js';
import { UyariYoneticisi } from './uyari.js';
import { geri_tusunu_kilitle, ayrilma_uyarisini_ac, ayrilma_uyarisini_kapat } from './gecmis.js';
import { onam_goster } from './ekranlar/onam.js';
import { anket_goster } from './ekranlar/anket.js';
import {
  onceden_tamamlandi_goster, gonderiliyor_goster, tesekkur_goster, hata_goster,
} from './ekranlar/mesaj.js';
import { denemeyi_yurut, kesilen_deneme_paketi, olcum_sil } from './deneme.js';
import { tercih_goster, karistir } from './ekranlar/tercih.js';
import { katilimci_olustur, katilimci_bitir, ApiHatasi } from './api.js';
import { kuyruga_ekle, kuyrugu_gonder, kuyruk_olaylarini_bagla } from './kuyruk.js';
import { UYGULAMA_SURUMU } from '../yapilandirma/surum.js';

const sahne = document.getElementById('sahne');
const demo = new URLSearchParams(location.search).get('demo') === '1';

async function deney_ayarlarini_yukle() {
  const yanit = await fetch('yapilandirma/deney.json', { cache: 'no-cache' });
  if (!yanit.ok) throw new Error('deney.json yüklenemedi');
  return yanit.json();
}

async function urun_icerigini_yukle() {
  const yanit = await fetch('icerik/urunler.json', { cache: 'no-cache' });
  if (!yanit.ok) throw new Error('urunler.json yüklenemedi');
  return (await yanit.json()).urunler;
}

/**
 * Bütün ürün görsellerini deney başlamadan indirir ve çözer; böylece ürün
 * sayfası açılırken ağ beklenmez. Görsel nesneleri bellekte tutulur.
 */
const onyuklenen_gorseller = [];
async function gorselleri_onyukle(deney) {
  const kodlar = [...deney.urunler.map((u) => u.kod), deney.alistirma_urunu.kod];
  await Promise.all(kodlar.map(async (kod) => {
    const gorsel = new Image();
    gorsel.src = `gorseller/urunler/${kod}.svg`;
    onyuklenen_gorseller.push(gorsel);
    await gorsel.decode().catch(() => {});
  }));
}

/** Yazı tipini deney başlamadan yükler (Türkçe karakterler dahil iki alt küme). */
async function yazi_tipini_yukle() {
  const ornek = 'Sepete Ekle ğüşıöçĞÜŞİÖÇ';
  await Promise.all([
    document.fonts.load(`400 16px Inter`, ornek),
    document.fonts.load(`600 16px Inter`, ornek),
  ]).catch(() => {});
}

async function baslat() {
  const [deney, icerik] = await Promise.all([deney_ayarlarini_yukle(), urun_icerigini_yukle()]);
  await Promise.all([yazi_tipini_yukle(), gorselleri_onyukle(deney)]);
  geri_tusunu_kilitle();

  // Demo modu: şerit, sayaç ve seçiciler yalnızca ?demo=1 ile yüklenir.
  const demo_modulu = demo ? await import('./demo.js') : null;
  const demo_serit = demo_modulu?.demo_seridini_kur({ deney }) ?? null;

  // Bu tarayıcıda deney daha önce tamamlandıysa tekrar katılım yok.
  const tamamlanma = tamamlanma_kaydi(demo);
  if (tamamlanma) {
    await onceden_tamamlandi_goster(sahne, tamamlanma.katilimci_kodu);
    return;
  }

  // Durumu yükle veya yeni başlat. Cihaz türü yalnızca burada, bir kez belirlenir.
  let durum = durumu_oku(demo);
  if (!durum) {
    const tespit = tarayicida_tespit_et(deney.olcum.tablet_min_kisa_kenar);
    durum = yeni_durum(demo_modulu ? demo_modulu.demo_cihazi_uygula(tespit) : tespit);
  } else {
    const { durum: duzeltilmis, kesilen_deneme } = yeniden_acilista_duzelt(durum);
    if (kesilen_deneme) {
      // Yarıda kalan deneme tekrarlanmaz: 'kesildi' olarak kaydedilir.
      kuyruga_ekle(demo, {
        tur: 'deneme',
        govde: {
          katilimci_id: durum.katilimci.katilimci_id,
          paket: kesilen_deneme_paketi({ demo, deneme_no: kesilen_deneme.deneme_no, cihaz: durum.cihaz.cihaz }),
        },
      });
      olcum_sil(demo);
    }
    durum = duzeltilmis;
  }
  const kaydet = (yeni) => { durum = yeni; durumu_yaz(demo, durum); demo_serit?.durum_degisti(durum); };
  kaydet(durum);

  const uyari = new UyariYoneticisi({
    cihaz: durum.cihaz.cihaz,
    masaustu_min_genislik: deney.olcum.masaustu_min_pencere_genisligi,
    // Demo modunda elle "mobil" seçilince geniş pencere yatay sayılmaz.
    yon_denetimi: !(demo_modulu && demo_modulu.demo_cihaz_secimi() === 'mobil'),
  });
  ayrilma_uyarisini_ac();
  kuyruk_olaylarini_bagla(demo);
  kuyrugu_gonder(demo); // önceki oturumdan bekleyen veri varsa

  // ---- Akış ----
  for (;;) {
    switch (durum.asama) {
      case 'onam':
        await onam_goster(sahne);
        kaydet({ ...durum, asama: 'anket' });
        break;

      case 'anket': {
        const anket = await anket_goster(sahne);
        const katilimci = await katilimciyi_olustur(durum, anket);
        kaydet(katilimci_atandi(durum, katilimci));
        break;
      }

      case 'deneme': {
        const plan_satiri = gecerli_deneme(durum);
        const { paket } = await denemeyi_yurut({
          sahne,
          deney,
          icerik,
          plan_satiri,
          cihaz: durum.cihaz.cihaz,
          uyari,
          demo,
          gozlemci: demo_serit?.gozlemci ?? null,
          baslangic_adimi: durum.deneme_adimi === 'zorluk' ? 'zorluk' : 'gorev',
          adim_kaydet: (adim, sonuc_) => kaydet(adim_degisti(durum, adim, sonuc_)),
        });
        // Deneme bitti: paket kuyruğa yazılır, sonra gönderilir (deneme sürerken ağ yok).
        kuyruga_ekle(demo, {
          tur: 'deneme',
          govde: {
            katilimci_id: durum.katilimci.katilimci_id,
            paket,
          },
        });
        olcum_sil(demo);
        kaydet(sonraki_deneme(durum));
        kuyrugu_gonder(demo);
        break;
      }

      case 'tercih': {
        // Gösterim sırası bir kez karıştırılır ve durumda saklanır; yenilemede aynı kalır.
        if (!durum.tercih_sirasi) kaydet({ ...durum, tercih_sirasi: karistir(deney.kosullar.map((k) => k.kod)) });
        const tercih = await tercih_goster(sahne, {
          cihaz: durum.cihaz.cihaz, gosterim_sirasi: durum.tercih_sirasi, deney, icerik,
        });
        kuyruga_ekle(demo, { tur: 'tercih', govde: { katilimci_id: durum.katilimci.katilimci_id, ...tercih } });
        kaydet({ ...durum, asama: 'bitis' });
        break;
      }

      case 'bitis':
        await bitisi_tamamla(durum);
        kaydet({ ...durum, asama: 'tamamlandi' });
        break;

      case 'tamamlandi':
        tamamlandi_isaretle(demo, durum.katilimci.katilimci_kodu);
        durumu_sil(demo);
        ayrilma_uyarisini_kapat();
        await tesekkur_goster(sahne, durum.katilimci.katilimci_kodu);
        return;

      default:
        throw new Error(`Bilinmeyen aşama: ${durum.asama}`);
    }
  }
}

/** Katılımcıyı veritabanında oluşturur; bağlantı yoksa tekrar denetir. */
async function katilimciyi_olustur(durum, anket) {
  for (;;) {
    try {
      const yanit = await katilimci_olustur({
        cihaz: durum.cihaz.cihaz,
        tablet_mi: durum.cihaz.tablet_mi,
        cihaz_tespiti: durum.cihaz.tespit,
        anket,
        uygulama_surumu: UYGULAMA_SURUMU,
        demo,
      });
      return yanit;
    } catch (hata) {
      const mesaj = hata instanceof ApiHatasi && hata.message === 'cok_fazla_katilimci'
        ? 'Şu anda çok sayıda katılımcı aynı anda başlıyor. Lütfen bir dakika sonra tekrar deneyin.'
        : 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
      await hata_goster(sahne, mesaj);
    }
  }
}

/** Bekleyen bütün veriler gönderilene kadar bekler, sonra deneyi bitirir. */
async function bitisi_tamamla(durum) {
  await gonderiliyor_goster(sahne);
  let hata_gosterildi = false;
  for (;;) {
    const bos = await kuyrugu_gonder(demo);
    if (bos) {
      try {
        await katilimci_bitir({ katilimci_id: durum.katilimci.katilimci_id, demo });
        return;
      } catch (hata) {
        console.error('katilimci_bitir:', hata);
      }
    }
    if (!hata_gosterildi) {
      await gonderiliyor_goster(sahne, { hata: true });
      hata_gosterildi = true;
    }
    await new Promise((coz) => setTimeout(coz, 5000));
  }
}

baslat().catch((hata) => {
  console.error(hata);
  sahne.replaceChildren(el('section', { class: 'akis' }, el('div', { class: 'akis-kart' },
    el('h1', {}, 'Deney yüklenemedi'),
    el('p', {}, 'Lütfen sayfayı yenileyin. Sorun sürerse araştırma ekibine bildirin.'))));
});

# Sepete Ekle Deneyi

Bu proje bir üniversite araştırması için hazırlandı. Katılımcılar kurgusal **Tivana** mağazasının 6 versiyonunda aynı görevi yapar: istenen ürünü sepete eklemek. Araştırılan soru şu: "Sepete Ekle" butonunun **konumu** (K1, K2) ve **rengi** (R1, R2, R3), butona tıklama süresini ve görev süresini nasıl etkiliyor?

- **Katılımcı sitesi:** `site/index.html`. Statik dosyalardan oluşur ve GitHub Pages'te yayınlanır.
- **Yönetim paneli:** `site/admin/`. İzleme, temizleme (hariç tutma), analiz ve dışa aktarma burada yapılır.
- **Veri:** Supabase'te tutulur (Postgres ve Auth). Kendi sunucumuz yoktur; tarayıcı Supabase ile doğrudan konuşur.
- Framework, derleme adımı ve harici CDN yoktur. Bütün kütüphaneler ve yazı tipleri depodadır.

Projenin değişmezleri ve alınmış kararlar bu dosyada ve kod yorumlarında yazılıdır.

---

## 1. Kurulum ve yerelde çalıştırma

Gerekenler: Node.js 22 veya üstü. Yerel veritabanı için ayrıca Docker Desktop.

```bash
npm install
npx playwright install chromium
```

### Supabase olmadan arayüzü denemek

Bellekte çalışan sahte bir API vardır. Veri saklamaz ve güvenlik kurallarını uygulamaz.

```bash
npm run site:sahte-api
```

- Katılımcı sitesi: http://127.0.0.1:8080/
- Demo modu: http://127.0.0.1:8080/?demo=1
- Panel: http://127.0.0.1:8080/admin/ (herhangi bir e-posta, parola `sahte-yonetici-parolasi`)

### Yerel Supabase ile

```bash
npx supabase start
npx supabase status
npx supabase db reset
npm run site
```

1. `npx supabase start` için Docker Desktop açık olmalı. Sahte API kapalı olmalı, çünkü ikisi de 54321 portunu kullanır.
2. `npx supabase status` çıktısındaki **API URL** ve **Publishable key** değerlerini `site/yapilandirma/supabase.js` dosyasına yazın.
3. `npx supabase db reset` migrasyonları ve `seed.sql` dosyasını uygular.
4. Yerel yönetici eklemek için Studio'yu (http://127.0.0.1:54323) açın ve **Authentication > Users** sayfasından bir kullanıcı ekleyin. Sonra **SQL Editor**'de aşağıdaki komutu çalıştırın (bkz. 2.4).
5. Demo tablolarına sahte veri yazmak için: `npm run sahte-veri -- --sayi=60`

### Testler

| Komut | Ne denetler | Gerekenler |
|---|---|---|
| `npm run kontrast` | Renk kontrast oranları | — |
| `npm run test:birim` | Özet hesabı, istatistik, kurallar, dışa aktarma, xlsx, kuyruk… | — |
| `npm run test:vt` | Kayıt fonksiyonları, yönetici fonksiyonları, **güvenlik denetimi** | Yerel Supabase |
| `npm run test:e2e` | Katılımcı akışı (masaüstü ve mobil), piksel değişmezliği, ilk ekran, panel, demo | Boş 8090 ve 54321 portları |

- **REST katmanında güvenlik denetimi:** `YEREL_YAYINLANABILIR_ANAHTAR=<publishable key> npm run test:vt`
- **Yayınlanacak (damgalı) kopyayı denemek:** `node scriptler/surum_damgala.mjs --yerel-izin`, ardından `SITE_KOKU=_site npx playwright test`

---

## 2. Canlıya alma

> Canlı kurulum 20 Kasım 2026’da yapıldı (proje AB bölgesinde, Frankfurt). Bundan sonraki canlı komutları ekip çalıştırır. **Gizli anahtar** (`sb_secret_...`, eski adıyla service_role) hiçbir dosyaya yazılmaz ve hiçbir komutta kullanılmaz. Sitenin ihtiyacı olan tek anahtar yayınlanabilir anahtardır (`sb_publishable_...`).

### 2.1 Supabase projesi

1. https://supabase.com/dashboard adresinden yeni bir proje açın. **Bölge olarak AB'de bir bölge seçin** (ör. Central EU / Frankfurt). Veritabanı parolasını ekipte güvenli bir yerde saklayın.
2. Şemayı ve deney ayarlarını yükleyin. Proje ref'i, panel adresindeki `project/<ref>` kısmıdır. İkinci komut migrasyonları ve `supabase/seed.sql` dosyasını (Williams dizileri, deney ayarları) uygular.
   ```bash
   npx supabase login
   npx supabase link --project-ref <proje-ref>
   npx supabase db push --include-seed
   ```

### 2.2 Auth ayarları

- **Authentication** ayarlarında **"Allow new users to sign up"** seçeneğini **kapatın**. Kapalıyken yalnızca var olan kullanıcılar giriş yapabilir. Katılımcılar hesap açmaz; giriş yalnızca yöneticiler içindir.
- E-posta ve parola ile giriş açık kalmalı.
- **URL Configuration > Site URL** alanına GitHub Pages adresini yazın: `https://<kullanici>.github.io/<depo>/`

### 2.3 Anahtarın yeri

Canlı proje adresi ve **publishable** anahtar **depoda tutulmaz**. Depodaki `site/yapilandirma/supabase.js` yalnızca yerel geliştirme adresini gösterir. Canlı değerler GitHub'da depo sırrı olarak durur:

- **Settings > Secrets and variables > Actions > Repository secrets**
  - `SUPABASE_ADRESI` = `https://<proje-ref>.supabase.co`
  - `SUPABASE_YAYINLANABILIR_ANAHTAR` = `sb_publishable_...` (Supabase: **Project Settings > API Keys**)

Yayın iş akışı bu iki değeri yalnızca yayınlanan kopyaya (`_site/yapilandirma/supabase.js`) yazar; depo geçmişine hiçbir zaman girmez.

Yayınlanabilir anahtar yine de yayınlanan sitede görünür; tarayıcının veritabanına bağlanması için bu zorunludur ve Supabase belgesi bunu güvenli sayar. Erişimi veritabanındaki kurallar sınırlar: tablolar anonim erişime kapalıdır; anahtarla yalnızca dört katılımcı fonksiyonu ve `canli_tut` çağrılabilir.

`surum_damgala.mjs` yayından önce denetler:
- Adres hâlâ yerelse (sırlar girilmemişse) yayın durur.
- Anahtar `sb_publishable_` ile başlamıyorsa yayın durur.
- Herhangi bir dosyada gizli anahtar izi varsa yayın durur.
- CSP'nin `connect-src` alanı bu adresle güncellenir.

### 2.4 Yönetici ekleme

1. **Authentication > Users > Add user** ile yöneticinin hesabını ekleyin. Gerçek e-posta gerekmez: `kullaniciadi@deney.local` biçiminde bir adres yazıp **Auto Confirm User** kutusunu işaretleyin. Panelde yalnızca `kullaniciadi` ile giriş yapılır (`@deney.local` uzantısını panel ekler).
2. **SQL Editor**'de çalıştırın:
   ```sql
   insert into public.yoneticiler (kullanici_id, eposta)
   select id, email from auth.users where email = 'yonetici@universite.edu.tr';
   ```

Yönetici yetkisi yalnızca bu tablodan gelir. Bu tabloda olmayan bir kullanıcı giriş yapsa bile hiçbir satır göremez ve hiçbir işlem yapamaz.

### 2.5 GitHub Pages

1. Depoda **Settings > Pages > Build and deployment > Source** alanını **GitHub Actions** yapın.
2. `main` dalına yapılan her gönderimde `.github/workflows/pages.yml` çalışır:
   - kontrast denetimi ve birim testleri,
   - Supabase adresi ve anahtarı (depo sırlarından), sürüm damgası (`uygulama_surumu`), önbellek parametreleri ve CSP,
   - yayın.
3. `.github/workflows/canli_tut.yml` günde iki kez `public.canli_tut()` fonksiyonunu çağırır; böylece ücretsiz plandaki proje etkinliksizlikten duraklatılmaz (bkz. 2.7). Actions sekmesinden elle de çalıştırılabilir.
4. Katılımcıya verilecek adres `https://<kullanici>.github.io/<depo>/`, panelin adresi `.../admin/` olur.

### 2.6 Yayın öncesi denetim listesi

- [ ] `SUPABASE_ADRESI` ve `SUPABASE_YAYINLANABILIR_ANAHTAR` depo sırlarında. Depoda hiçbir yerde `sb_secret_` yok.
- [ ] "Supabase'i uyanık tut" iş akışı Actions sekmesinde yeşil.
- [ ] "Allow new users to sign up" kapalı. Yöneticiler `yoneticiler` tablosunda.
- [ ] Pages iş akışı yeşil. Panelde giriş çalışıyor; Özet sekmesinde Williams blokları görünüyor.
- [ ] **Demo modunda** (`?demo=1`) 6 versiyonun hepsi bir kez açıldı, sayaç ve versiyon seçici çalışıyor. Demo verisi panelde **Demo** setinde görünüyor; gerçek sette görünmüyor.
- [ ] Onam metni ve iletişim bilgileri etik kurul onayındaki metinle aynı.
- [ ] **Önce 5 kişilik pilot:** en az 2 masaüstü ve 2 telefon, mümkünse 1 tablet. Pilottan sonra panelde şunlar denetlenir:
  - 5 katılımcının hepsi "tamamladı" durumunda;
  - her katılımcıda 7 deneme var;
  - `iz_eksik` ve "Buton ilk anda görünmüyor" rozeti yok;
  - **Farkları denetle** "bütün özetler tutarlı" diyor;
  - CSV ve xlsx dosyaları Excel'de ve analiz yazılımında doğru açılıyor.
- [ ] Pilot verisi analize girmeyecekse pilot katılımcıları panelde "Diğer: pilot" nedeniyle hariç tutulur (silinmez).
- [ ] Veri toplama sürerken **her gün tam yedek** alınır (Dışa aktar > Tam yedeği indir).

### 2.7 Ücretsiz plan sınırları

Kaynak: supabase.com/pricing, supabase.com/docs/guides/platform/backups ve billing-on-supabase sayfaları (14 Kasım 2026'da okundu).

| Sınır | Etkisi | Önlem |
|---|---|---|
| **1 hafta etkinliği olmayan proje duraklatılır** | Duraklatılmış projeye katılımcı kaydı yapılamaz. | `canli_tut.yml` günde iki kez veritabanına istek atar ("günde birkaç istek yeterli": supabase.com/docs/guides/platform/free-project-pausing). GitHub, 60 gün commit almayan açık depoda zamanlanmış işi kapatır; kapanırsa Actions sekmesinden yeniden açın. Duraklatılmışsa Supabase panelinden **Resume project**. |
| **500 MB veritabanı** | Bir deneme paketi en çok 2 MB, ama tipik paket çok daha küçüktür (birkaç yüz olay). | Panelde katılımcı sayısını izleyin. Gerekirse tam yedek alıp demo tablolarını temizleyin. |
| **Otomatik yedek yok** | Günlük yedekler yalnızca ücretli planlarda (Pro 7 gün). | Her gün paneldeki **Tam yedek (JSON)**. İsteğe bağlı olarak `npx supabase db dump`. |
| 2 ücretsiz proje, 5 GB veri çıkışı, 50.000 MAU | Bu deney için yeterli. | — |

---

## 3. Veri sözlüğü

Gerçek veri önekiz tablolarda, demo verisi `test_` önekli aynı yapıdaki tablolarda tutulur. Süreler milisaniyedir ve tarayıcıda `performance.now()` ile ölçülür.

### katilimcilar (katılımcı başına bir satır)

| Alan | Açıklama |
|---|---|
| `katilimci_id` | Rastgele UUID. Yalnızca katılımcının tarayıcısında saklanır. |
| `katilimci_kodu` | Katılımcıya gösterilen 8 karakterlik kod. Silme veya geri çekme isteğinde kullanılır. |
| `cihaz` | `masaustu` / `mobil`. Deney başında bir kez belirlenir. |
| `tablet_mi` | Kaba işaretçi ve kısa kenarı 600 px veya daha büyük. Tabletler mobil şablonu kullanır. |
| `cihaz_tespiti` | Tespit ayrıntıları: medya sorguları, ekran ve pencere boyutu. Demoda elle seçilirse `kural = 'demo_elle'`. |
| `yas_grubu` | Yaş, seçenek olarak sorulur: `18-20`, `21-30`, `31-40`, `41-50`, `51+`. 18 yaş altı katılamaz; tam yaş saklanmaz. |
| `cinsiyet`, `alisveris_sikligi`, `alisveris_cihazi`, `katilim_cihazi`, `renk_ayirt_zorlugu` | Anket yanıtları. `renk_ayirt_zorlugu` sorusu: "Renkleri ayırt etmekte zorluk yaşıyor musunuz?" (evet / hayır / emin değilim). |
| `cihaz_uyusmazligi` | Ankette bildirilen cihaz ile tespit edilen cihaz uyuşmuyor. |
| `sira_no`, `dizi_no`, `urun_kaydirmasi` | Atama: sıra numarası, Williams dizisi (0–5), ürün sırası kaydırması (0–5). |
| `sira_cakismasi` | Bıraktıktan sonra dönen katılımcının numarası bu arada başkasına verilmiş. |
| `durum` | `devam_ediyor` / `tamamladi` / `birakti` (30 dakika etkinlik yoksa). |
| `baslangic_zamani`, `bitis_zamani`, `son_etkinlik_zamani` | Sunucu saati. Süre hesabında kullanılmaz. |
| `uygulama_surumu` | Sitenin sürümü: commit, tarih ve özet. |
| `haric_tutuldu`, `haric_nedeni`, `haric_aciklama` | Katılımcı düzeyinde hariç tutma. |

### denemeler (katılımcı × deneme; alıştırma dahil 7 satır)

| Alan | Açıklama |
|---|---|
| `deneme_no` | 0 = alıştırma (K1R0, ürün defter), 1–6 = deneme. |
| `kosul_indeksi`, `kosul_kodu`, `konum`, `renk`, `urun_kodu` | Plan, sunucuda atanır. |
| `sonuc` | `basarili` / `vazgecildi` / `zaman_asimi` (60 sn) / `kesildi` (sayfa deneme ortasında kapandı). |
| `zorluk_puani` | 1–7. Yalnızca başarılı denemede sorulur. |
| `ekran_*`, `pencere_*`, `cihaz_piksel_orani`, `tarayici_bilgisi` | Ürün sayfası açıldığı andaki ekran bilgisi. |
| `buton_ilk_gorunur`, `buton_x/y/genislik/yukseklik` | Sıfır anında hedef butonun konumu ve görünürlüğü. |
| `iz_eksik` | Fare veya kaydırma izleri eksik (kota ya da yedek paket). |
| `kayit_zamani` | Paketin sunucuya ulaştığı an. |
| `haric_tutuldu`, `haric_nedeni`, `haric_aciklama` | Deneme düzeyinde hariç tutma. |

### deneme_ozetleri (deneme başına bir satır; ham olaylardan `site/js/ozet.js` ile hesaplanır)

| Alan | Tanım |
|---|---|
| `tiklama_suresi_ms` | **Birincil ölçü.** Ürün sayfasının sıfır noktasından hedef butondaki `pointerup` anına kadar. |
| `gorev_suresi_ms` | Başla'daki `pointerup` anından hedef butondaki `pointerup` anına kadar. |
| `*_net_ms` | Yalnızca duraklatma (yön uyarısı, dar pencere) süreleri çıkarılmış hali. Sekme dışı süre çıkarılmaz. |
| `basili_tutma_suresi_ms` | Hedef butonda `pointerdown` → `pointerup`. |
| `buton_gorunme_suresi_ms` | Sıfırdan butonun en az %50'sinin görünür olduğu ana kadar (ilk anda görünürse 0). |
| `buton_bulma_suresi_ms` | Butonun göründüğü andan tıklamaya kadar. |
| `hatali_tiklama_sayisi` | Üst çubuk öğeleri, favori ve adet seçicideki tıklamalar. |
| `bos_tiklama_sayisi` | Metin, görsel ve boş alandaki tıklamalar (Vazgeç ve onay penceresi sayılmaz). |
| `toplam_kaydirma_px` | Dikey kaydırmaların mutlak toplamı. |
| `sekme_degisti`, `sekme_disi_sure_ms` | Deneme sırasında sekmeden çıkıldı mı ve ne kadar süre dışarıda kalındı. |
| `duraklatildi`, `duraklatma_suresi_ms` | Uyarı yüzünden duraklatma. |
| `ozet_surumu` | Hesaplama kodunun sürümü. |

### olaylar (ham olay kaydı; değiştirilmez)

| Alan | Açıklama |
|---|---|
| `olay_id` | Tarayıcıda üretilen UUID. Tekrar gönderimde çift kaydı önler. |
| `sayfa` | `gorev` / `urun` / `eklendi` / `zorluk` |
| `olay_turu` | `sayfa_goruntulendi`, `buton_gorundu`, `buton_hover_ilk`, `tiklama`, `basis_iptal`, `sekme_degisti`, `yon_degisti`, `boyut_degisti`, `duraklatildi`, `devam_edildi`, `vazgecildi`, `zaman_asimi`, `gorev_tamamlandi` |
| `zaman_ms` | Görev ekranının sıfır noktasından itibaren (görev ekranındaki `sayfa_goruntulendi` = 0). |
| `x`, `y`, `hedef_oge`, `giris_turu` | Konum (CSS pikseli), öğe kimliği (`data-oge`), `fare` / `dokunma` / `kalem`. |
| `ek` | Olay türüne özgü ayrıntılar (ör. `hedef_buton_mu`, `basili_tutma_ms`, `uyari`, `durum`). |

### izler, tercihler, islem_kaydi

- **izler:** deneme × sayfa × iz türü (`fare` her 50 ms, `kaydirma` her 100 ms). `ornekler` alanı `[zaman_ms, x, y]` dizisidir.
- **tercihler:** `en_cok_kosul`, `en_az_kosul`, isteğe bağlı `neden` (en çok 500 karakter) ve `gosterim_sirasi` (önizlemelerin karışık gösterim sırası).
- **islem_kaydi:** her hariç tutma, geri alma, silme, özet güncelleme ve dışa aktarma. Kaydedilenler: yönetici, zaman, kural ve süzgeç, etkilenen kayıtlar.
- **genis_tablo:** analiz için birleştirilmiş görünüm, deneme başına bir satır. Yalnızca yöneticiler görebilir.

---

## 4. Ürün veya koşul değiştirme

Koşulların, renklerin, ürünlerin ve Williams dizilerinin **tek kaynağı** `site/yapilandirma/deney.json` dosyasıdır.

**Ürün değiştirmek veya eklemek.** Deney 6 ürünle tasarlanmıştır; her denemede bir ürün kullanılır.
1. `deney.json > urunler` listesindeki bir ürünü değiştirin: `kod`, `ad`, `fiyat_tl`.
2. `site/icerik/urunler.json` dosyasına aynı kodla içerik ekleyin: kategori, kısa açıklama, açıklama, özellikler, bakım.
3. `site/gorseller/urunler/<kod>.svg` görselini ekleyin (400×400).
4. `npm run williams` çalıştırın. Bu komut `seed.sql` dosyasını yeniden yazar.
5. Yerelde `npx supabase db reset`, ardından `npm run test:birim` ve `npm run test:e2e`. Piksel değişmezliği ve ilk ekran testleri yeni ürünle de geçmeli.
6. Canlıda `npx supabase db push --include-seed`.

**Ürün metnine ilişkin kural:** Ad tek satıra sığmalı ve kısa açıklama en çok 3 satır olmalı. Bu ölçüler sabittir; sığmayan metin düzeni bozar ve e2e testi bunu yakalar.

**Renk değiştirmek:** `deney.json > renkler`, ardından `npm run kontrast` (hedef tutmazsa çıkış kodu 1).

**Yeni koşul eklemek** (ör. R4 veya K3) bir tasarım değişikliğidir. Williams dizileri, veritabanındaki "6 koşul" denetimleri ve tercih ekranı 6 koşula göre kuruludur. Bunun için:
- yeni bir migrasyon (`supabase/migrations/`) gerekir;
- `williams.mjs`, `deney.json`, şablon ve testler güncellenir.

Veri toplama başladıktan sonra koşul değiştirilmez.

---

## 5. Gizlilik notu

- **Toplanmayanlar:** ad, e-posta, IP adresi veya başka kimlik bilgisi. Sitenin kendi sunucusu yoktur. Supabase ve GitHub, kendi altyapılarında standart erişim günlükleri tutabilir; bu günlükler araştırma verisine katılmaz.
- **Toplananlar:**
  - 6 anket yanıtı (yaş grubu, cinsiyet, alışveriş alışkanlığı, cihaz, renk ayırt etme);
  - cihaz ve ekran bilgisi;
  - deney sırasındaki tıklama, dokunma, imleç ve kaydırma hareketleri ile süreleri;
  - tasarım tercihi ve isteğe bağlı gerekçe metni.
- **Katılımcıyla eşleştirme:** Katılımcıya bir **katılımcı kodu** gösterilir. Verisinin silinmesini isterse ekip bu kodla panelden kalıcı silme yapar (çift onaylı ve işlem kaydına yazılır).
- **Tarayıcıda tutulanlar:** İlerleme ve gönderilmeyi bekleyen veri, yalnızca katılımcının tarayıcısında, `localStorage` içinde durur. Deney bitince ilerleme kaydı silinir; yalnızca "tamamlandı" işareti kalır, aynı tarayıcıdan ikinci katılımı önlemek için.
- **Erişim:** Veriyi yalnızca `yoneticiler` tablosundaki hesaplar görebilir. Tablolar anonim erişime kapalıdır. Katılımcı yalnızca kendi kimliğiyle (`katilimci_id`) kendi denemesini yazabilir; kaydedilmiş bir deneme sonradan değiştirilemez.
- **Saklama:** Veri, Supabase'in AB bölgesindeki projesinde ve ekibin aldığı yedeklerde tutulur. Saklama süresi ve imha, etik kurul onayındaki plana göre ekip tarafından yürütülür.

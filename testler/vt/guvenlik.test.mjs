// Güvenlik denetimi (8. aşama). Katalogdan bütün tablo, görünüm, dizi ve
// fonksiyonları bulur; yenisi eklense bile denetim kendiliğinden kapsar.
//
// Yayınlanabilir anahtarla gelen istek veritabanında "anon" rolüne, giriş
// yapmış kullanıcı "authenticated" rolüne eşlenir (Supabase Data API). Bu
// yüzden denetim bu iki rolle yapılır:
//   - anon ve yönetici olmayan kullanıcı hiçbir tabloyu okuyamaz/yazamaz,
//   - anon yalnızca dört katılımcı fonksiyonunu ve canli_tut'u çağırabilir,
//   - yönetici olmayan kullanıcı her yönetici fonksiyonunda reddedilir,
//   - yönetici bile tablolara doğrudan yazamaz (yalnızca fonksiyonlarla),
//   - bir katılımcı başka bir katılımcının denemesini değiştiremez,
//   - bütün security definer fonksiyonların search_path'i boştur.
// Yerel Supabase çalışıyorsa ayrıca gerçek REST uç noktası denenir.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  havuz, sorgu, rolle, temizle, katilimci_olustur, deneme_kaydet, ornek_paket, reddedilmeli,
} from '../yardimci/vt.mjs';

const KATILIMCI_FONKSIYONLARI = ['deneme_kaydet', 'katilimci_bitir', 'katilimci_olustur', 'tercih_kaydet'];
// Canlı tutma (uyku önleme) fonksiyonu: tabloya dokunmaz, yalnızca 'true' döndürür.
const ANON_FONKSIYONLARI = [...KATILIMCI_FONKSIYONLARI, 'canli_tut'].sort();
const SIRADAN = randomUUID();
const YONETICI = randomUUID();

before(async () => {
  await temizle();
  await sorgu(`insert into auth.users (id, aud, role, email) values
    ($1, 'authenticated', 'authenticated', 'siradan@ornek.test'),
    ($2, 'authenticated', 'authenticated', 'yonetici@ornek.test')`, [SIRADAN, YONETICI]);
  await sorgu('insert into public.yoneticiler (kullanici_id, eposta) values ($1, $2)', [YONETICI, 'yonetici@ornek.test']);
});
after(async () => {
  await temizle();
  await sorgu('delete from public.yoneticiler where kullanici_id = $1', [YONETICI]);
  await sorgu('delete from auth.users where id = any($1)', [[SIRADAN, YONETICI]]);
  await havuz.end();
});

async function iliskiler() {
  return sorgu(`select c.relname ad, c.relkind tur from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S') order by 1`);
}

async function fonksiyonlar() {
  return sorgu(`select p.oid, p.proname ad, p.prosecdef tanimlayici, p.proconfig ayar,
      p.proargtypes::regtype[]::text[] tipler,
      has_function_privilege('anon', p.oid, 'execute') anon,
      has_function_privilege('authenticated', p.oid, 'execute') giris
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' order by p.proname`);
}

test('katalog: anon hiçbir ilişkide hiçbir yetkiye sahip değil; authenticated hiçbir yere yazamaz', async () => {
  const liste = await iliskiler();
  assert.ok(liste.length >= 20, `ilişki sayısı: ${liste.length}`);
  const ihlaller = [];
  for (const { ad, tur } of liste) {
    const yetkiler = tur === 'S' ? ['USAGE', 'SELECT', 'UPDATE'] : ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
    for (const y of yetkiler) {
      const fonk = tur === 'S' ? 'has_sequence_privilege' : 'has_table_privilege';
      const [{ anon, giris }] = await sorgu(`select ${fonk}('anon', $1, $2) anon, ${fonk}('authenticated', $1, $2) giris`, [`public.${ad}`, y]);
      if (anon) ihlaller.push(`anon ${y} ${ad}`);
      if (giris && !['SELECT'].includes(y)) ihlaller.push(`authenticated ${y} ${ad}`);
    }
  }
  assert.deepEqual(ihlaller, []);
});

test('katalog: her tabloda RLS açık; görünümler security_invoker', async () => {
  const kapali = await sorgu(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`);
  assert.deepEqual(kapali, []);
  const gorunumler = await sorgu(`select relname, reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'`);
  for (const g of gorunumler) {
    assert.ok((g.reloptions ?? []).includes('security_invoker=true'), `${g.relname} security_invoker değil`);
  }
});

test('katalog: anon yalnızca dört katılımcı fonksiyonunu ve canli_tut fonksiyonunu çağırabilir; security definer fonksiyonlarda search_path boş', async () => {
  const f = await fonksiyonlar();
  assert.deepEqual(f.filter((x) => x.anon).map((x) => x.ad).sort(), ANON_FONKSIYONLARI);
  // Alt çizgiyle başlayan yardımcılar kimseye açık değil.
  assert.deepEqual(f.filter((x) => x.ad.startsWith('_') && (x.anon || x.giris)).map((x) => x.ad), []);
  for (const x of f.filter((y) => y.tanimlayici)) {
    assert.ok((x.ayar ?? []).some((a) => a === 'search_path=""' || a === 'search_path='), `${x.ad}: search_path ayarlı değil`);
  }
});

test('tablolar: anon ve yönetici olmayan kullanıcı okuyamaz, ekleyemez, güncelleyemez, silemez', async () => {
  const k = await katilimci_olustur();
  await deneme_kaydet(k.katilimci_id, ornek_paket(0));
  const once = (await sorgu('select count(*)::int n from public.olaylar'))[0].n;
  for (const { ad, tur } of (await iliskiler()).filter((x) => x.tur !== 'S')) {
    const [{ sutun }] = await sorgu(`select column_name sutun from information_schema.columns
      where table_schema = 'public' and table_name = $1 and is_identity = 'NO' and is_generated = 'NEVER'
      order by ordinal_position limit 1`, [ad]);
    const komutlar = [
      `select * from public.${ad} limit 1`,
      `insert into public.${ad} default values`,
      `update public.${ad} set ${sutun} = ${sutun}`,
      `delete from public.${ad}`,
    ];
    await reddedilmeli(rolle('anon', komutlar[0]), 'permission denied');
    for (const sql of komutlar.slice(1)) {
      // Görünüme yazma, yetki denetiminden önce "cannot insert into view" ile reddedilebilir.
      if (tur === 'v') await assert.rejects(rolle('anon', sql), `${ad}: ${sql}`);
      else await reddedilmeli(rolle('anon', sql), 'permission denied');
    }
    // Giriş yapmış ama yönetici olmayan: okuma boş döner (RLS), yazma reddedilir.
    assert.deepEqual(await rolle('authenticated', komutlar[0], [], SIRADAN), [], `${ad} siradan kullanıcıya satır döndürdü`);
    for (const sql of komutlar.slice(1)) {
      if (tur === 'v') {
        await assert.rejects(rolle('authenticated', sql, [], SIRADAN), `${ad}: ${sql}`);
      } else {
        await reddedilmeli(rolle('authenticated', sql, [], SIRADAN), 'permission denied');
        // Yönetici de doğrudan yazamaz.
        await reddedilmeli(rolle('authenticated', sql, [], YONETICI), 'permission denied');
      }
    }
  }
  assert.equal((await sorgu('select count(*)::int n from public.olaylar'))[0].n, once);
});

test('yönetici fonksiyonları: anon reddedilir, yönetici olmayan "yetkisiz" alır', async () => {
  const yonetici_fonksiyonlari = (await fonksiyonlar()).filter((x) => x.giris && !x.ad.startsWith('_')
    && !ANON_FONKSIYONLARI.includes(x.ad) && x.ad !== 'yonetici_mi');
  assert.ok(yonetici_fonksiyonlari.length >= 6, yonetici_fonksiyonlari.map((x) => x.ad).join(', '));
  for (const f of yonetici_fonksiyonlari) {
    // Bütün parametreler NULL; yetki denetimi girdiden önce yapılmalı.
    const sql = `select public.${f.ad}(${f.tipler.map((t) => `null::${t}`).join(', ')})`;
    await reddedilmeli(rolle('anon', sql), 'permission denied');
    await reddedilmeli(rolle('authenticated', sql, [], SIRADAN), 'yetkisiz');
  }
  // yonetici_mi: siradan için false, anon çağıramaz.
  assert.deepEqual(await rolle('authenticated', 'select public.yonetici_mi() as y', [], SIRADAN), [{ y: false }]);
  await reddedilmeli(rolle('anon', 'select public.yonetici_mi()'), 'permission denied');
  assert.equal((await sorgu('select count(*)::int n from public.islem_kaydi'))[0].n, 0);
});

test('başka katılımcının denemesi değiştirilemez; bilinmeyen kimlikle yazılamaz', async () => {
  const a = await katilimci_olustur();
  await deneme_kaydet(a.katilimci_id, ornek_paket(1));
  const ozet_once = await sorgu(`select d.sonuc, d.zorluk_puani, o.tiklama_suresi_ms, d.kosul_kodu from public.denemeler d
    join public.deneme_ozetleri o using (deneme_id) where d.katilimci_id = $1 and d.deneme_no = 1`, [a.katilimci_id]);

  // Aynı denemeye farklı sonuçla ikinci paket: deneme bilgisi ve özet değişmez.
  const ikinci = ornek_paket(1, { sonuc: 'vazgecildi', zorluk_puani: null });
  ikinci.ozet = { ...ikinci.ozet, tiklama_suresi_ms: 1 };
  const [{ s }] = await rolle('anon', 'select public.deneme_kaydet($1, $2, false) as s', [a.katilimci_id, ikinci]);
  assert.equal(s.yeni_kayit, false);
  const ozet_sonra = await sorgu(`select d.sonuc, d.zorluk_puani, o.tiklama_suresi_ms, d.kosul_kodu from public.denemeler d
    join public.deneme_ozetleri o using (deneme_id) where d.katilimci_id = $1 and d.deneme_no = 1`, [a.katilimci_id]);
  assert.deepEqual(ozet_sonra, ozet_once);

  // Bilinmeyen katılımcı kimliği ve yanlış tablo seti (demo kimliği gerçek sete) reddedilir.
  await reddedilmeli(rolle('anon', 'select public.deneme_kaydet($1, $2, false)', [randomUUID(), ornek_paket(1)]), 'katilimci_bulunamadi');
  const demo = await katilimci_olustur({ demo: true });
  await reddedilmeli(rolle('anon', 'select public.deneme_kaydet($1, $2, false)', [demo.katilimci_id, ornek_paket(1)]), 'katilimci_bulunamadi');
  await reddedilmeli(rolle('anon', 'select public.tercih_kaydet($1, $2, $3, null, $4, false)',
    [randomUUID(), 'K1R1', 'K2R1', ['K1R1', 'K1R2', 'K1R3', 'K2R1', 'K2R2', 'K2R3']]), 'katilimci_bulunamadi');
  await reddedilmeli(rolle('anon', 'select public.katilimci_bitir($1, false)', [randomUUID()]), 'katilimci_bulunamadi');
});

// ---------------------------------------------------------------------
// Yerel Supabase çalışıyorsa: gerçek REST uç noktası (yayınlanabilir anahtar)
// ---------------------------------------------------------------------
const REST = process.env.YEREL_API_ADRESI ?? 'http://127.0.0.1:54321';
const ANAHTAR = process.env.YEREL_YAYINLANABILIR_ANAHTAR;

test('REST: yayınlanabilir anahtarla tablolar ve yönetici fonksiyonları kapalı', { skip: !ANAHTAR && 'YEREL_YAYINLANABILIR_ANAHTAR verilmedi (npx supabase status)' }, async () => {
  const basliklar = { apikey: ANAHTAR, 'Content-Type': 'application/json' };
  for (const { ad, tur } of (await iliskiler()).filter((x) => x.tur !== 'S')) {
    const oku = await fetch(`${REST}/rest/v1/${ad}?select=*&limit=1`, { headers: basliklar });
    assert.ok(oku.status === 401 || oku.status === 403 || oku.status === 404, `${ad} okuma: ${oku.status}`);
    if (tur !== 'v') {
      const yaz = await fetch(`${REST}/rest/v1/${ad}`, { method: 'POST', headers: basliklar, body: '{}' });
      assert.ok(yaz.status >= 400, `${ad} yazma: ${yaz.status}`);
    }
  }
  const yonetici_fonksiyonlari = (await fonksiyonlar()).filter((x) => !ANON_FONKSIYONLARI.includes(x.ad));
  for (const f of yonetici_fonksiyonlari) {
    const y = await fetch(`${REST}/rest/v1/rpc/${f.ad}`, { method: 'POST', headers: basliklar, body: '{}' });
    assert.ok(y.status >= 400, `${f.ad}: ${y.status}`);
  }
});

test('canli_tut: anon çağırabilir, yalnızca true döndürür ve hiçbir tabloya dokunmaz', async () => {
  const once = (await sorgu('select count(*)::int n from public.katilimcilar'))[0].n;
  const [{ canli_tut }] = await rolle('anon', 'select public.canli_tut()');
  assert.equal(canli_tut, true);
  assert.equal((await sorgu('select count(*)::int n from public.katilimcilar'))[0].n, once);
  const [f] = await sorgu(`select prosecdef from pg_proc where proname = 'canli_tut'`);
  assert.equal(f.prosecdef, false, 'canli_tut security invoker olmalı');
});

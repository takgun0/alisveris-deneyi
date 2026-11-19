// Küçük xlsx (Office Open XML) yazıcısı — dış kütüphane gerektirmez.
//
// Yalnızca yazma: her sayfa için başlık satırı + veri satırları. Metinler
// "inlineStr" olarak, sayılar sayı, mantıksal değerler TRUE/FALSE olarak yazılır.
// ZIP sıkıştırması tarayıcının CompressionStream('deflate-raw') API'siyle
// yapılır; API yoksa sıkıştırmasız (store) yazılır. Node 18+ ile de çalışır.

const kodlayici = new TextEncoder();

// ---- CRC-32 ----
const CRC_TABLOSU = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(veri) {
  let c = 0xffffffff;
  for (let i = 0; i < veri.length; i++) c = CRC_TABLOSU[(c ^ veri[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function sikistir(veri) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const akis = new Blob([veri]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(akis).arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * ZIP arşivi oluşturur.
 * @param {{ad: string, veri: Uint8Array}[]} dosyalar
 * @returns {Promise<Uint8Array>}
 */
export async function zip_olustur(dosyalar) {
  const parcalar = [];
  const merkez = [];
  let konum = 0;
  for (const d of dosyalar) {
    const ad = kodlayici.encode(d.ad);
    const crc = crc32(d.veri);
    const sikismis = await sikistir(d.veri);
    const yontem = sikismis && sikismis.length < d.veri.length ? 8 : 0;
    const govde = yontem === 8 ? sikismis : d.veri;

    const yerel = new DataView(new ArrayBuffer(30));
    yerel.setUint32(0, 0x04034b50, true);
    yerel.setUint16(4, 20, true);       // sürüm
    yerel.setUint16(6, 0x0800, true);   // bayrak: UTF-8 adlar
    yerel.setUint16(8, yontem, true);
    yerel.setUint16(10, 0, true);       // saat
    yerel.setUint16(12, 0x21, true);    // tarih (1980-01-01)
    yerel.setUint32(14, crc, true);
    yerel.setUint32(18, govde.length, true);
    yerel.setUint32(22, d.veri.length, true);
    yerel.setUint16(26, ad.length, true);
    yerel.setUint16(28, 0, true);
    parcalar.push(new Uint8Array(yerel.buffer), ad, govde);

    const m = new DataView(new ArrayBuffer(46));
    m.setUint32(0, 0x02014b50, true);
    m.setUint16(4, 20, true);
    m.setUint16(6, 20, true);
    m.setUint16(8, 0x0800, true);
    m.setUint16(10, yontem, true);
    m.setUint16(12, 0, true);
    m.setUint16(14, 0x21, true);
    m.setUint32(16, crc, true);
    m.setUint32(20, govde.length, true);
    m.setUint32(24, d.veri.length, true);
    m.setUint16(28, ad.length, true);
    m.setUint32(42, konum, true);
    merkez.push(new Uint8Array(m.buffer), ad);
    konum += 30 + ad.length + govde.length;
  }
  const merkez_boyu = merkez.reduce((t, p) => t + p.length, 0);
  const son = new DataView(new ArrayBuffer(22));
  son.setUint32(0, 0x06054b50, true);
  son.setUint16(8, dosyalar.length, true);
  son.setUint16(10, dosyalar.length, true);
  son.setUint32(12, merkez_boyu, true);
  son.setUint32(16, konum, true);
  const hepsi = [...parcalar, ...merkez, new Uint8Array(son.buffer)];
  const sonuc = new Uint8Array(hepsi.reduce((t, p) => t + p.length, 0));
  let i = 0;
  for (const p of hepsi) { sonuc.set(p, i); i += p.length; }
  return sonuc;
}

// ---- XML ----
// XML 1.0'da geçersiz denetim karakterleri atılır.
const xml = (m) => String(m)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 0 → A, 25 → Z, 26 → AA */
export function sutun_harfi(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function hucre(v, ref, stil = 0) {
  const s = stil ? ` s="${stil}"` : '';
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${ref}" t="b"${s}><v>${v ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}

function sayfa_xml({ basliklar, satirlar }, deger_cevir) {
  const parcalar = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
    '<sheetData>'];
  const satir = (degerler, r, stil) => `<row r="${r}">${degerler.map((v, i) => hucre(deger_cevir(v), `${sutun_harfi(i)}${r}`, stil)).join('')}</row>`;
  parcalar.push(satir(basliklar, 1, 1));
  satirlar.forEach((s, i) => parcalar.push(satir(s, i + 2, 0)));
  parcalar.push('</sheetData></worksheet>');
  return parcalar.join('');
}

/** Excel sayfa adı: en çok 31 karakter, yasak karakterler yok. */
const sayfa_adi = (ad) => String(ad).replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sayfa';

/**
 * xlsx dosyası oluşturur.
 * @param {{ad: string, basliklar: string[], satirlar: any[][]}[]} sayfalar
 * @param {{deger_cevir?: (v: any) => any}} [secenek] hücre değerlerine uygulanacak dönüşüm (ör. formül güvenliği)
 * @returns {Promise<Uint8Array>}
 */
export async function xlsx_olustur(sayfalar, { deger_cevir = (v) => v } = {}) {
  const dosyalar = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sayfalar.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sayfalar.map((s, i) => `<sheet name="${xml(sayfa_adi(s.ad))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sayfalar.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sayfalar.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>'],
    ...sayfalar.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sayfa_xml(s, deger_cevir)]),
  ];
  return zip_olustur(dosyalar.map(([ad, metin]) => ({ ad, veri: kodlayici.encode(metin) })));
}

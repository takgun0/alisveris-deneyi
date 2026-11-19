// Chart.js (depodaki kutuphaneler/chart-4.6.1.umd.min.js; global "Chart") yardımcıları.
// Animasyon kapalıdır; her yenilemede grafikler yeniden çizilir.

const kayitli = new Set();

/** Açık bütün grafikleri yok eder (sekme yeniden çizilmeden önce). */
export function grafikleri_temizle() {
  for (const g of kayitli) g.destroy();
  kayitli.clear();
}

/** Seri renkleri: cihaz ve konum için ayırt edilebilir, turuncu kullanılmaz (R2/R3 ile karışmasın). */
export const SERI_RENKLERI = ['#1F5FA8', '#0F766E', '#6B46C1', '#52667A'];

// Güven aralığı bıyıkları: her veri kümesinde "araliklar" = [[alt, ust], ...]
const biyik_eklentisi = {
  id: 'guven_bigiklari',
  afterDatasetsDraw(grafik) {
    const { ctx } = grafik;
    const y = grafik.scales.y;
    grafik.data.datasets.forEach((ds, i) => {
      const meta = grafik.getDatasetMeta(i);
      if (meta.hidden || !ds.araliklar) return;
      ctx.save();
      ctx.strokeStyle = ds.borderColor;
      ctx.lineWidth = 1.5;
      meta.data.forEach((nokta, j) => {
        const a = ds.araliklar[j];
        if (!a || a[0] === null || a[1] === null) return;
        const x = nokta.x;
        const ust = y.getPixelForValue(a[1]);
        const alt = y.getPixelForValue(a[0]);
        ctx.beginPath();
        ctx.moveTo(x, ust); ctx.lineTo(x, alt);
        ctx.moveTo(x - 5, ust); ctx.lineTo(x + 5, ust);
        ctx.moveTo(x - 5, alt); ctx.lineTo(x + 5, alt);
        ctx.stroke();
      });
      ctx.restore();
    });
  },
};

/**
 * Noktalı çizgi grafiği (ortalama/medyan ve güven aralığı bıyıkları).
 * @param {HTMLCanvasElement} tuval
 * @param {object} p
 * @param {string[]} p.etiketler x ekseni
 * @param {{ad: string, degerler: (number|null)[], araliklar?: ([number,number]|null)[], kesikli?: boolean}[]} p.seriler
 * @param {string} p.y_baslik
 */
export function cizgi_grafigi(tuval, { etiketler, seriler, y_baslik, baslik }) {
  const Chart = globalThis.Chart;
  if (!Chart) return null;
  // Eksen, güven aralıklarını da kapsasın (bıyıklar grafik dışına taşmasın).
  const uclar = seriler.flatMap((s) => [...s.degerler, ...(s.araliklar ?? []).flat()]).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const en_az = uclar.length ? Math.min(...uclar) : 0;
  const en_cok = uclar.length ? Math.max(...uclar) : 1;
  const pay = (en_cok - en_az) * 0.08 || 50;
  const g = new Chart(tuval, {
    type: 'line',
    data: {
      labels: etiketler,
      datasets: seriler.map((s, i) => ({
        label: s.ad,
        data: s.degerler,
        araliklar: s.araliklar ?? null,
        borderColor: s.renk ?? SERI_RENKLERI[i % SERI_RENKLERI.length],
        backgroundColor: s.renk ?? SERI_RENKLERI[i % SERI_RENKLERI.length],
        borderDash: s.kesikli ? [6, 4] : [],
        pointRadius: 5,
        pointHoverRadius: 6,
        spanGaps: true,
      })),
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { left: 12, right: 12 } },
      plugins: {
        title: baslik ? { display: true, text: baslik, color: '#102A43', font: { weight: '600' } } : { display: false },
        legend: { position: 'bottom', labels: { color: '#102A43' } },
        tooltip: {
          callbacks: {
            label: (c) => {
              const a = c.dataset.araliklar?.[c.dataIndex];
              const d = c.parsed.y;
              const fmt = (v) => Math.round(v).toLocaleString('tr-TR');
              return `${c.dataset.label}: ${d === null ? '—' : fmt(d)} ms${a ? ` [%95 GA ${fmt(a[0])}–${fmt(a[1])}]` : ''}`;
            },
          },
        },
      },
      scales: {
        x: { offset: true, ticks: { color: '#102A43' }, grid: { display: false } },
        y: {
          suggestedMin: Math.max(0, en_az - pay),
          suggestedMax: en_cok + pay,
          title: { display: Boolean(y_baslik), text: y_baslik, color: '#52667A' },
          ticks: { color: '#52667A', callback: (v) => Number(v).toLocaleString('tr-TR') },
          grid: { color: '#E6ECF2' },
        },
      },
    },
    plugins: [biyik_eklentisi],
  });
  kayitli.add(g);
  return g;
}

/** Yatay çubuk grafiği (tercih sayıları gibi). */
export function cubuk_grafigi(tuval, { etiketler, seriler, x_baslik }) {
  const Chart = globalThis.Chart;
  if (!Chart) return null;
  const g = new Chart(tuval, {
    type: 'bar',
    data: {
      labels: etiketler,
      datasets: seriler.map((s, i) => ({
        label: s.ad, data: s.degerler, backgroundColor: s.renk ?? SERI_RENKLERI[i % SERI_RENKLERI.length],
      })),
    },
    options: {
      animation: false,
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#102A43' } } },
      scales: {
        x: { beginAtZero: true, title: { display: Boolean(x_baslik), text: x_baslik, color: '#52667A' }, ticks: { precision: 0, color: '#52667A' } },
        y: { ticks: { color: '#102A43' }, grid: { display: false } },
      },
    },
  });
  kayitli.add(g);
  return g;
}

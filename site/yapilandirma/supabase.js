// Supabase bağlantı bilgileri.
//
// Bu dosyadaki anahtar YAYINLANABİLİR (publishable, sb_publishable_...) anahtardır.
// Herkese açıktır; güvenlik veritabanındaki erişim kurallarından gelir.
// Gizli anahtar (sb_secret_... / service_role) buraya ASLA yazılmaz.
//
// Yerel geliştirmede: "npx supabase status" çıktısındaki API URL ve
// Publishable key değerlerini yazın. Canlıda: README > "Canlıya alma".

export const SUPABASE_ADRESI = 'http://127.0.0.1:54321';
export const SUPABASE_YAYINLANABILIR_ANAHTAR = 'YEREL_YAYINLANABILIR_ANAHTAR';

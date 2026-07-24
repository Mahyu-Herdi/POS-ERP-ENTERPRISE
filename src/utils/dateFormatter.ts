export function formatTanggalIndo(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  
  let cleaned = dateStr.trim();
  let d = new Date();
  let isParsed = false;

  // Let's analyze if there's a pattern: dd/mm/yyyy or yyyy-mm-dd
  const parts = cleaned.split(/[\s,]+/);
  const datePart = parts[0];
  const timePart = parts[1] || "";

  if (datePart.includes('/') || (datePart.includes('-') && datePart.split('-').length === 3)) {
    let year = new Date().getFullYear();
    let month = new Date().getMonth(); // 0-indexed
    let day = new Date().getDate();
    let hours = 0;
    let minutes = 0;

    if (datePart.includes('/')) {
      const dParts = datePart.split('/');
      if (dParts.length === 3) {
        day = parseInt(dParts[0], 10);
        month = parseInt(dParts[1], 10) - 1;
        year = parseInt(dParts[2], 10);
      }
    } else if (datePart.includes('-')) {
      const dParts = datePart.split('-');
      if (dParts.length === 3) {
        if (dParts[0].length === 4) {
          year = parseInt(dParts[0], 10);
          month = parseInt(dParts[1], 10) - 1;
          day = parseInt(dParts[2], 10);
        } else {
          day = parseInt(dParts[0], 10);
          month = parseInt(dParts[1], 10) - 1;
          year = parseInt(dParts[2], 10);
        }
      }
    }

    if (timePart) {
      const tParts = timePart.replace(/\./g, ':').split(':');
      if (tParts.length >= 2) {
        hours = parseInt(tParts[0], 10) || 0;
        minutes = parseInt(tParts[1], 10) || 0;
      }
    }

    const testDate = new Date(year, month, day, hours, minutes);
    if (!isNaN(testDate.getTime())) {
      d = testDate;
      isParsed = true;
    }
  }

  if (!isParsed) {
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) {
      d = parsed;
      isParsed = true;
    }
  }

  if (!isParsed) {
    return dateStr; // fallback if invalid
  }

  const namaHari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const namaBulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const hari = namaHari[d.getDay()];
  const tanggal = String(d.getDate()).padStart(2, '0');
  const bulan = namaBulan[d.getMonth()];
  const tahun = d.getFullYear();
  const jam = String(d.getHours()).padStart(2, '0');
  const menit = String(d.getMinutes()).padStart(2, '0');

  return `${hari}, ${tanggal} ${bulan} ${tahun} Jam ${jam}.${menit}`;
}

import React, { useState } from 'react';
import { useStore } from '../store';
import { CheckCircle2, Check, Download } from 'lucide-react';
import { useAppModal } from './ModalContext';
import { formatTanggalIndo } from '../utils/dateFormatter';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CustomDatePicker from './CustomDatePicker';

export default function TabStok() {
  const { stokData, stokHistory, keuangan, addStok, updateStok, deleteStok, addStokHistory, updateKeuangan, addTransaksi } = useStore();
  const getToday = () => new Date().toISOString().split('T')[0];
  const getLocalYMD = (dateStr: string) => {
    if (!dateStr) return '';
    if (!dateStr.includes('T')) return dateStr;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [filterMulai, setFilterMulai] = useState(getToday());
  const [filterAkhir, setFilterAkhir] = useState(getToday());
  const [searchName, setSearchName] = useState('');
  const { popup } = useAppModal();

  const catatMutasi = (stokId: string, nama: string, tipe: string, qty: number, sisaSebelum: number, sisaSetelah: number, txId?: string) => {
    addStokHistory({
      id: 'h' + Date.now() + Math.random().toString(36).substring(2, 6),
      stokId,
      nama,
      item: nama,
      tipe,
      qty,
      sisaSebelum,
      sisaSetelah,
      tgl: new Date().toISOString(),
      keterangan: '',
      txId
    });
  };

  const bikinStokBaru = async () => {
    const nama = await popup('prompt_text', "Nama bahan baku baru (Cth: Gula):", "Buat Stok");
    if (!nama) return;
    const satuan = await popup('prompt_text', "Satuan (Cth: kg / gr / liter):", "Satuan");
    if (!satuan) return;
    const harga = await popup('prompt_num', `Harga beli per 1 ${satuan} (Rp)?\n(Contoh: Jika 1 kg Rp20.000, maka 1 gr Rp20)`, "Harga Satuan");
    if (harga === false) return;
    
    let qtyAwal = await popup('prompt_float', `Jumlah stok awal yang dibeli saat ini? (Modal Pertama)\nKetik 0 jika hanya input nama dulu.`, "Stok Awal");
    if (qtyAwal === false) qtyAwal = 0;

    const totalModalStok = harga * qtyAwal;
    updateKeuangan({ modalBahan: keuangan.modalBahan + totalModalStok });
    
    const newId = 's' + Date.now();
    addStok({ id: newId, nama, sisa: qtyAwal, unit: satuan, hargaPerUnit: harga });
    
    if (qtyAwal > 0) {
      catatMutasi(newId, nama, 'Modal Awal', qtyAwal, 0, qtyAwal);
    }
    
    await popup('alert', `Item ${nama} ditambahkan.\nStok Awal: ${qtyAwal} ${satuan}\nModal Awal: Rp ${totalModalStok.toLocaleString('id-ID')}`, 'Berhasil');
  };

  const handleTambahStok = async (idx: number) => {
    const item = stokData[idx];
    const n = await popup('prompt_float', `Jumlah ${item.unit} yang dibeli untuk ${item.nama}?`, "Belanja Stok");
    if (n && n > 0) {
      const hargaSatuan = await popup('prompt_num', `Harga beli per 1 ${item.unit} (Rp)?\n(Harga saat ini: Rp ${item.hargaPerUnit})`, "Harga Satuan");
      if (hargaSatuan !== false) {
        const totalBiaya = hargaSatuan * n;
        const txId = Date.now().toString();
        updateKeuangan({ keluarStok: keuangan.keluarStok + totalBiaya });
        updateStok(idx, { sisa: item.sisa + n, hargaPerUnit: hargaSatuan });
        catatMutasi(item.id, item.nama, 'Masuk (Beli)', n, item.sisa, item.sisa + n, txId);
        const txRecord = {
          id: txId,
          tgl: new Date().toLocaleString('id-ID'),
          tglRaw: getToday(),
          tipe: 'Belanja Stok',
          ident: `Beli ${item.nama}`,
          stokId: item.id,
          stokQty: n,
          items: [],
          total: totalBiaya,
          bayar: totalBiaya,
          metode: 'Cash'
        };
        addTransaksi(txRecord);

        await popup('alert', `Stok ditambah.\nTotal Pengeluaran Rp ${totalBiaya.toLocaleString('id-ID')} dicatat.\nHarga per ${item.unit} diupdate menjadi Rp ${hargaSatuan.toLocaleString('id-ID')}.`, "Berhasil");
      }
    }
  };

  const handleKurangStok = async (idx: number) => {
    const item = stokData[idx];
    const n = await popup('prompt_float', `Berapa ${item.unit} yang terpakai manual?`, "Pengurangan Stok");
    if (n && n > 0 && item.sisa >= n) {
      updateStok(idx, { sisa: item.sisa - n });
      catatMutasi(item.id, item.nama, 'Keluar (Pakai)', n, item.sisa, item.sisa - n);
    } else if (n) {
      await popup('alert', "Stok tidak mencukupi!", "Gagal");
    }
  };

  const handleHapusStok = async (idx: number) => {
    if (await popup('confirm', `Hapus item bahan "${stokData[idx].nama}" dari sistem?`, "Hapus Stok")) {
      deleteStok(idx);
    }
  };

  const filteredHistory = stokHistory.filter(d => {
    let match = true;
    const itemDate = getLocalYMD(d.tgl);
    if (filterMulai && filterAkhir) {
      match = match && itemDate >= filterMulai && itemDate <= filterAkhir;
    } else if (filterMulai) {
      match = match && itemDate === filterMulai;
    } else if (filterAkhir) {
      match = match && itemDate === filterAkhir;
    }
    if (searchName) {
      match = match && (d.item || d.nama || '').toLowerCase().includes(searchName.toLowerCase());
    }
    return match;
  }).reverse();

  const handleCetakPDF = () => {
    const doc = new jsPDF();
    const now = new Date();
    const hariCetak = now.toLocaleDateString('id-ID', { weekday: 'long' });
    const tglCetak = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const jamCetak = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    doc.setFontSize(16);
    doc.text('Laporan Riwayat Stok', 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Dicetak pada: ${hariCetak}, ${tglCetak} | ${jamCetak}`, 14, 28);
    
    const stokMasuk = filteredHistory.filter(h => h.tipe.toLowerCase().includes('masuk') || h.tipe.toLowerCase().includes('modal awal'));
    const stokKeluar = filteredHistory.filter(h => h.tipe.toLowerCase().includes('keluar'));
    
    const formatWaktu = (isoString: string) => {
      const d = new Date(isoString);
      const hari = d.toLocaleDateString('id-ID', { weekday: 'long' });
      const tgl = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
      const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      return `${hari}, ${tgl} ${jam}`;
    };

    doc.setFontSize(12);
    doc.text('Stok Masuk', 14, 38);
    
    autoTable(doc, {
      startY: 42,
      head: [['Waktu (Hari, Tgl, Jam)', 'Item', 'Keterangan/Tipe', 'Qty']],
      body: stokMasuk.map(h => [
        formatWaktu(h.tgl),
        h.item || h.nama,
        h.tipe,
        `+${h.qty}`
      ]),
      theme: 'grid',
      headStyles: { fillColor: [40, 167, 69] },
      styles: { fontSize: 9 }
    });
    
    let finalY = (doc as any).lastAutoTable.finalY || 42;
    
    doc.setFontSize(12);
    doc.text('Stok Keluar', 14, finalY + 10);
    
    autoTable(doc, {
      startY: finalY + 14,
      head: [['Waktu (Hari, Tgl, Jam)', 'Item', 'Keterangan/Tipe', 'Qty']],
      body: stokKeluar.map(h => [
        formatWaktu(h.tgl),
        h.item || h.nama,
        h.tipe,
        `-${h.qty}`
      ]),
      theme: 'grid',
      headStyles: { fillColor: [220, 53, 69] },
      styles: { fontSize: 9 }
    });
    
    doc.save(`Laporan_Stok_${tglCetak.replace(/ /g, '_')}.pdf`);
  };

  return (
    <div className="split-layout">
      <div className="left-panel">
        <div className="clay-card">
          <div className="flex-between">
            <h3 style={{ color: 'var(--text-muted)' }}>Manajemen Item Stok & Bahan Baku</h3>
            <button className="btn bg-green" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={bikinStokBaru}>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Item Baru
            </button>
          </div>
          <table>
            <thead>
              <tr><th>Bahan</th><th>Est. Harga/Unit</th><th>Sisa Stok</th><th style={{ textAlign: 'right' }}>Aksi</th></tr>
            </thead>
            <tbody>
              {stokData.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Belum ada item stok.</td></tr>
              ) : (
                stokData.map((s, i) => (
                  <tr key={s.id}>
                    <td><strong>{s.nama}</strong></td>
                    <td>Rp {s.hargaPerUnit.toLocaleString('id-ID')}/{s.unit}</td>
                    <td>{s.sisa} {s.unit}</td>
                    <td style={{ textAlign: 'right', display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button className="btn bg-red" style={{ padding: '4px 8px', borderRadius: '8px' }} onClick={() => handleKurangStok(i)}>
                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                      </button> 
                      <button className="btn bg-blue" style={{ padding: '4px 8px', borderRadius: '8px' }} onClick={() => handleTambahStok(i)}>
                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                      </button>
                      <button className="btn bg-orange" style={{ padding: '4px 8px', borderRadius: '8px', color: 'var(--text-main)', fontSize: '11px' }} onClick={() => handleHapusStok(i)}>Hapus</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="right-panel">
        <div className="clay-card">
          <div className="flex-between" style={{ marginBottom: '15px' }}>
            <h3 style={{ color: 'var(--text-muted)', margin: 0 }}>Riwayat Mutasi Stok</h3>
            <button className="btn bg-blue" style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={handleCetakPDF}>
              <Download size={14} /> Cetak PDF
            </button>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
            <input type="text" placeholder="Cari nama..." value={searchName} onChange={e => setSearchName(e.target.value)} className="btn-input" style={{ margin: 0, fontSize: '12px', flex: 1, minWidth: '120px' }} />
            <CustomDatePicker value={filterMulai} onChange={setFilterMulai} placeholder="Mulai Tgl" className="btn-input" style={{ margin: 0, fontSize: '12px', width: '110px' }} />
            <CustomDatePicker value={filterAkhir} onChange={setFilterAkhir} placeholder="Akhir Tgl" className="btn-input" style={{ margin: 0, fontSize: '12px', width: '110px' }} />
            <button className="btn bg-dim" style={{ margin: 0, padding: '10px 15px', fontSize: '12px', color: 'var(--text-main)' }} onClick={() => { setFilterMulai(''); setFilterAkhir(''); setSearchName(''); }}>Reset</button>
          </div>
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Tgl</th><th>Item</th><th>Tipe</th><th>Qty</th></tr></thead>
              <tbody>
                {filteredHistory.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Tidak ada mutasi</td></tr>
                ) : (
                  filteredHistory.map((h, idx) => (
                    <tr key={idx}>
                      <td style={{ fontSize: '11px' }}>{formatTanggalIndo(h.tgl)}</td>
                      <td><strong>{h.item || h.nama}</strong></td>
                      <td className={h.tipe.includes('Masuk') ? 'text-green' : 'text-red'} style={{ fontSize: '11px', fontWeight: 'bold' }}>{h.tipe}</td>
                      <td>{h.qty}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

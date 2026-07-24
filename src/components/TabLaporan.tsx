import React, { useState } from 'react';
import { useStore } from '../store';
import { CheckCircle2, Check, Printer } from 'lucide-react';
import { useAppModal } from './ModalContext';
import { formatTanggalIndo } from '../utils/dateFormatter';
import CustomDatePicker from './CustomDatePicker';

export default function TabLaporan() {
  const { keuangan, bebanAktif, transaksiList, hutangList, updateKeuangan, addTransaksi, deleteTransaksi, updateHutang } = useStore();
  const posRole = localStorage.getItem('pos_role') || 'admin';
  const [namaPengeluaran, setNamaPengeluaran] = useState('');
  const [nominalPengeluaran, setNominalPengeluaran] = useState('');
  const [inputPrive, setInputPrive] = useState('');
  
  const getToday = () => new Date().toISOString().split('T')[0];
  const getLocalYMD = (dateStr: string) => {
    if (!dateStr) return '';
    if (!dateStr.includes('T')) return dateStr;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [filterTxMulai, setFilterTxMulai] = useState(getToday());
  const [filterTxAkhir, setFilterTxAkhir] = useState(getToday());
  const [searchName, setSearchName] = useState('');
  const { popup } = useAppModal();

  const formatUang = (val: string) => {
    const num = parseInt(val.replace(/\D/g, ''), 10);
    if (isNaN(num)) return '';
    return num.toLocaleString('id-ID');
  };

  const parseAngka = (val: string) => parseInt(val.replace(/\D/g, ''), 10) || 0;

  // Perhitungan Keuangan Akurat secara Dinamis dari transaksiList
  const totalMasuk = transaksiList.reduce((acc, tx) => {
    const labelTipe = tx.tipe || 'Penjualan';
    if (labelTipe === 'Penjualan' || labelTipe === 'Pelunasan Kasbon') {
      return acc + tx.total;
    }
    return acc;
  }, 0);

  const op = transaksiList.reduce((acc, tx) => tx.tipe === 'Pengeluaran' ? acc + tx.total : acc, 0);
  const stok = transaksiList.reduce((acc, tx) => tx.tipe === 'Belanja Stok' ? acc + tx.total : acc, 0);
  const prive = transaksiList.reduce((acc, tx) => tx.tipe === 'Prive' ? acc + tx.total : acc, 0);
  const hppTerjual = transaksiList.reduce((acc, tx) => {
    if (tx.tipe === 'Penjualan' || tx.tipe === 'Kasbon') {
      return acc + (tx.hppTotal || 0);
    }
    return acc;
  }, 0);

  // Omset dihitung secara akrual (Penjualan Lunas + Kasbon Aktif)
  const kotor = transaksiList.reduce((acc, tx) => {
    if (tx.tipe === 'Penjualan' || tx.tipe === 'Kasbon') {
      return acc + tx.total;
    }
    return acc;
  }, 0);

  // Laba Bersih = Omset - HPP - Operasional. Belanja Stok tidak memotong Laba secara langsung karena dicatat sebagai Aset yang dideplesi melalui HPP saat makanan terjual.
  const bersih = kotor - hppTerjual - op;

  // Sisa Uang Laci adalah arus kas murni: Uang masuk (Penjualan lunas + Pelunasan kasbon) - Uang keluar (Belanja stok + Operasional + Prive)
  const sisaKasLaci = totalMasuk - op - stok - prive;

  const modalAset = bebanAktif.aset.reduce((acc, a) => acc + a.harga, 0);
  const modalBahan = keuangan.modalBahan + stok;
  const totalModal = modalAset + modalBahan;
  const roi = bersih - totalModal;

  const filteredTx = transaksiList.filter(x => {
    let match = true;
    const itemDate = getLocalYMD(x.tglRaw);
    if (filterTxMulai && filterTxAkhir) {
      match = match && itemDate >= filterTxMulai && itemDate <= filterTxAkhir;
    } else if (filterTxMulai) {
      match = match && itemDate === filterTxMulai;
    } else if (filterTxAkhir) {
      match = match && itemDate === filterTxAkhir;
    }
    if (searchName) {
      match = match && x.ident.toLowerCase().includes(searchName.toLowerCase());
    }
    return match;
  });

  // Dynamic filtered values based on active filters (e.g. date range) - Accrual basis for P&L
  const omsetFiltered = filteredTx.reduce((acc, tx) => {
    const labelTipe = tx.tipe || 'Penjualan';
    if (labelTipe === 'Penjualan' || labelTipe === 'Kasbon') {
      return acc + tx.total;
    }
    return acc;
  }, 0);

  const opFiltered = filteredTx.reduce((acc, tx) => {
    if (tx.tipe === 'Pengeluaran') {
      return acc + tx.total;
    }
    return acc;
  }, 0);

  const hppFiltered = filteredTx.reduce((acc, tx) => {
    return acc + (tx.hppTotal || 0);
  }, 0);

  const bersihFiltered = omsetFiltered - opFiltered - hppFiltered;

  const tambahPengeluaran = async () => {
    const nom = parseAngka(nominalPengeluaran);
    if (!namaPengeluaran || nom <= 0) {
      await popup('alert', "Isi pengeluaran dengan benar!", "Gagal");
      return;
    }
    updateKeuangan({ keluarOp: keuangan.keluarOp + nom });
    
    const txRecord = { tgl: new Date().toLocaleString('id-ID'), tglRaw: getToday(), tipe: 'Pengeluaran', ident: namaPengeluaran, items: [], total: nom, bayar: nom, metode: 'Cash' };
    addTransaksi(txRecord);
    
    await popup('alert', `Pengeluaran "${namaPengeluaran}" Rp ${nom.toLocaleString('id-ID')} dicatat.`, "Berhasil");
    setNamaPengeluaran('');
    setNominalPengeluaran('');
  };

  const tarikPrive = async () => {
    const nom = parseAngka(inputPrive);
    if (nom <= 0) {
      await popup('alert', "Masukkan nominal prive!", "Gagal");
      return;
    }
    if (nom > sisaKasLaci) {
      await popup('alert', "Uang laci tidak mencukupi!", "Saldo Kurang");
      return;
    }
    if (await popup('confirm', `Tarik uang Rp ${nom.toLocaleString('id-ID')} dari laci?`, "Konfirmasi Prive")) {
      updateKeuangan({ prive: keuangan.prive + nom });
      const txRecord = { tgl: new Date().toLocaleString('id-ID'), tglRaw: getToday(), tipe: 'Prive', ident: 'Penarikan Prive', items: [], total: nom, bayar: nom, metode: 'Cash' };
      addTransaksi(txRecord);
      setInputPrive('');
      await popup('alert', "Prive berhasil dicatat sebagai pengeluaran arus keluar.", "Sukses");
    }
  };

  const bayarHutang = async (idx: number) => {
    const h = hutangList[idx];
    
    const riwayatTxs = transaksiList.filter((tx: any) => tx.tipe === 'Kasbon' && tx.ident?.trim().toLowerCase() === h.nama?.trim().toLowerCase());
    let rincianItems = "";
    riwayatTxs.forEach((tx: any) => {
      rincianItems += `\n[${formatTanggalIndo(tx.tgl)}]\n`;
      if (tx.items && tx.items.length > 0) {
        tx.items.forEach((it: any) => {
           rincianItems += `- ${it.nama || it.name} x${it.qty}\n`;
        });
      } else {
        rincianItems += `- Transaksi: Rp ${tx.total.toLocaleString('id-ID')}\n`;
      }
    });
    
    if (!rincianItems) {
      rincianItems = "\n- (Tidak ada rincian item yg tercatat di riwayat transaksi)\n";
    }

    const maxTampil = rincianItems.length > 500 ? rincianItems.substring(0, 500) + "...\n(Lihat riwayat untuk selengkapnya)" : rincianItems;

    const jumlah = await popup('prompt_float', `Rincian Item:${maxTampil}\nSisa hutang ${h.nama}: Rp ${h.sisa.toLocaleString('id-ID')}.\nBayar berapa?`, "Bayar Kasbon");
    
    if (jumlah && jumlah > 0 && jumlah <= h.sisa) {
      updateKeuangan({ masuk: keuangan.masuk + jumlah });
      
      const txRecord = { tgl: new Date().toLocaleString('id-ID'), tglRaw: getToday(), tipe: 'Pelunasan Kasbon', ident: h.nama, hutangId: h.id, items: [], total: jumlah, bayar: jumlah, metode: 'Cash' };
      addTransaksi(txRecord);
      
      const newHutang = [...hutangList];
      newHutang[idx] = {
        ...h,
        sisa: h.sisa - jumlah,
        pembayaran: [...h.pembayaran, { tgl: getToday(), jumlah }]
      };
      
      if (newHutang[idx].sisa <= 0) {
        newHutang.splice(idx, 1);
      }
      updateHutang(newHutang);
      await popup('alert', "Pembayaran hutang berhasil!", "Sukses");
    } else if (jumlah > h.sisa) {
      await popup('alert', "Jumlah bayar melebihi sisa hutang!", "Gagal");
    }
  };

  const hapusTransaksi = async (tx: any) => {
    if (await popup('confirm', `Hapus riwayat transaksi ini?\n(Penghapusan akan mengembalikan saldo & stok seperti sebelum transaksi)`, "Hapus Transaksi")) {
      const originalIdx = transaksiList.indexOf(tx);
      if (originalIdx >= 0) {
        deleteTransaksi(originalIdx);
        await popup('alert', "Transaksi berhasil dihapus & direverse.", "Dihapus");
      }
    }
  };

  let sumIn = 0;
  let sumOut = 0;

  filteredTx.forEach(tx => {
    const labelTipe = tx.tipe || 'Penjualan';

    if (labelTipe === 'Penjualan' || labelTipe === 'Pelunasan Kasbon') {
      sumIn += tx.total;
    } else if (labelTipe === 'Pengeluaran' || labelTipe === 'Prive') {
      sumOut += tx.total;
    } else if (labelTipe === 'Belanja Stok') {
      sumOut += tx.total;
    }
  });

  const laciPeriode = sumIn - sumOut;

  const filteredHutang = hutangList.filter(x => {
    let match = true;
    const itemDate = getLocalYMD(x.tglRaw);
    if (filterTxMulai && filterTxAkhir) {
      match = match && itemDate >= filterTxMulai && itemDate <= filterTxAkhir;
    } else if (filterTxMulai) {
      match = match && itemDate === filterTxMulai;
    } else if (filterTxAkhir) {
      match = match && itemDate === filterTxAkhir;
    }
    if (searchName) {
      match = match && x.nama.toLowerCase().includes(searchName.toLowerCase());
    }
    return match;
  });

  const tampilkanDetailTransaksi = async (tx: any) => {
    const labelTipe = tx.tipe || 'Penjualan';
    let detailItems = '';
    let calculatedHpp = tx.hppTotal || 0;
    let calculatedBebanOp = tx.bebanOpTotal || 0;

    if (tx.items && tx.items.length > 0) {
      detailItems = tx.items.map((it: any) => `• ${it.name} x${it.qty} (@Rp ${it.harga.toLocaleString('id-ID')})`).join('\n');
      
      if (calculatedHpp === 0 || calculatedBebanOp === 0) {
        tx.items.forEach((it: any) => {
          const m = useStore.getState().menu.find((x: any) => x.id === it.id || x.name === it.name);
          if (m) {
            if (calculatedHpp === 0) calculatedHpp += (m.hppBahan || 0) * it.qty;
            if (calculatedBebanOp === 0) calculatedBebanOp += (m.hppOp || 0) * it.qty;
          }
        });
      }
    } else {
      detailItems = 'Tidak ada rincian item.';
    }
    const totalFormat = tx.total.toLocaleString('id-ID');
    const estimatedProfit = tx.total - calculatedHpp - calculatedBebanOp;

    const msg = `Tipe: ${labelTipe}\nKeterangan/Meja: ${tx.ident}\nTanggal: ${formatTanggalIndo(tx.tgl)}\nMetode: ${tx.metode || 'Cash'}\n\nRincian Pesanan:\n${detailItems}\n\n---------------------------------\nTotal Belanja: Rp ${totalFormat}\nModal Bahan (HPP): Rp ${calculatedHpp.toLocaleString('id-ID')}\nBeban Ops: Rp ${calculatedBebanOp.toLocaleString('id-ID')}\nEstimasi Untung: Rp ${estimatedProfit.toLocaleString('id-ID')}`;
    const action = await popup('receipt_detail', msg, `Detail Transaksi`, tx);
    if (action === 'print') {
      window.dispatchEvent(new CustomEvent('print-receipt', { detail: tx }));
    } else if (action === 'share') {
      const toko = useStore.getState().toko;
      const shareText = `*${toko.nama || 'ERBEA COFFEE SPACE'}*\n${toko.alamat || 'Alamat Toko'}\n\n*Detail Transaksi*\nKeterangan/Meja: ${tx.ident}\nTanggal: ${formatTanggalIndo(tx.tgl)}\nMetode: ${tx.metode || 'Cash'}\n\n*Rincian Pesanan:*\n${detailItems.replace(/•/g, '-')}\n\n---------------------------------\nTotal Belanja: Rp ${totalFormat}\nModal Bahan (HPP): Rp ${calculatedHpp.toLocaleString('id-ID')}\nBeban Ops: Rp ${calculatedBebanOp.toLocaleString('id-ID')}\nEstimasi Untung: Rp ${estimatedProfit.toLocaleString('id-ID')}\n\nTerima Kasih!`;
      
      const fallback = () => {
        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
        window.open(url, '_blank');
      };
      
      if (navigator.share) {
        navigator.share({
          title: `Detail Transaksi - ${tx.ident || 'Umum'}`,
          text: shareText,
        }).catch((err) => {
          console.log('Error sharing:', err);
          fallback();
        });
      } else {
        fallback();
      }
    }
  };

  const handlePrintReport = () => {
    window.dispatchEvent(new CustomEvent('print-financial-report', {
      detail: {
        filterMulai: filterTxMulai,
        filterAkhir: filterTxAkhir,
        searchName,
        pemasukan: sumIn,
        pengeluaran: sumOut,
        laciPeriode: laciPeriode,
        penjualan: filteredTx.filter(tx => (tx.tipe || 'Penjualan') === 'Penjualan' || tx.tipe === 'Kasbon').reduce((acc, tx) => acc + tx.total, 0),
        pelunasanKasbon: filteredTx.filter(tx => tx.tipe === 'Pelunasan Kasbon').reduce((acc, tx) => acc + tx.total, 0),
        pengeluaranOps: filteredTx.filter(tx => tx.tipe === 'Pengeluaran').reduce((acc, tx) => acc + tx.total, 0),
        belanjaStok: filteredTx.filter(tx => tx.tipe === 'Belanja Stok').reduce((acc, tx) => acc + tx.total, 0),
        prive: filteredTx.filter(tx => tx.tipe === 'Prive').reduce((acc, tx) => acc + tx.total, 0),
        hpp: filteredTx.reduce((acc, tx) => acc + (tx.hppTotal || 0), 0),
        labaBersih: bersihFiltered,
        modalAset,
        modalBahan,
        totalModal,
        roi,
        sisaKasLaci,
        kasbonAktif: filteredHutang,
        totalKasbonAktif: filteredHutang.reduce((acc, h) => acc + h.sisa, 0),
        transaksi: filteredTx
      }
    }));
  };

  return (
    <>
      <div className="clay-card">
        <h3 style={{ color: 'var(--text-muted)', marginBottom: '15px' }}>Riwayat Transaksi & Arus Keuangan Komprehensif</h3>
        
        <div className="flex-between"><span>Total Pemasukan:</span> <strong className="text-green" style={{ fontWeight: 900 }}>Rp {sumIn.toLocaleString('id-ID')}</strong></div>
        <div className="flex-between"><span>Total Pengeluaran:</span> <strong className="text-red" style={{ fontWeight: 900 }}>Rp {sumOut.toLocaleString('id-ID')}</strong></div>
        <div className="flex-between" style={{ marginBottom: '10px' }}><span>Sisa Uang di Laci (Periode):</span> <strong style={{ fontWeight: 900, color: 'var(--text-main)' }}>Rp {laciPeriode.toLocaleString('id-ID')}</strong></div>
        <div className="flex-between text-green font-bold" style={{ fontSize: '15px', marginBottom: '15px' }}>
          <span>Total Laba Bersih (Periode):</span>
          <strong style={{ fontWeight: 900 }}>Rp {bersihFiltered.toLocaleString('id-ID')}</strong>
        </div>
        <hr style={{ border: 0, borderTop: '1px dashed rgba(163,177,198,0.4)', margin: '10px 0 15px 0' }} />

        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Cari nama..." className="btn-input" style={{ margin: 0, fontSize: '12px', flex: '1 1 150px' }} value={searchName} onChange={e => setSearchName(e.target.value)} />
          <CustomDatePicker value={filterTxMulai} onChange={setFilterTxMulai} placeholder="Mulai Tgl" className="btn-input" style={{ margin: 0, fontSize: '12px', flex: '1 1 120px' }} />
          <CustomDatePicker value={filterTxAkhir} onChange={setFilterTxAkhir} placeholder="Akhir Tgl" className="btn-input" style={{ margin: 0, fontSize: '12px', flex: '1 1 120px' }} />
          <button className="btn bg-dim" style={{ margin: 0, padding: '10px 15px', fontSize: '12px', color: 'var(--text-main)' }} onClick={() => { setFilterTxMulai(''); setFilterTxAkhir(''); setSearchName(''); }}>Reset</button>
          <button className="btn bg-blue" style={{ margin: 0, padding: '10px 15px', fontSize: '12px', color: 'var(--text-main)' }} onClick={handlePrintReport}>
            <Printer size={14} /> Cetak PDF Laporan
          </button>
        </div>
        <table>
          <thead><tr><th>Tgl</th><th>Keterangan / Tipe</th><th>Total</th><th>Via</th><th style={{textAlign: 'right'}}>Aksi</th></tr></thead>
          <tbody>
            {filteredTx.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>Belum ada riwayat keuangan</td></tr>
            ) : (
              [...filteredTx].reverse().map((tx, idx) => {
                const labelTipe = tx.tipe || 'Penjualan';
                let colorClass = 'text-green';
                if (labelTipe === 'Pengeluaran' || labelTipe === 'Prive' || labelTipe === 'Kasbon') colorClass = 'text-red';
                return (
                  <tr key={idx}>
                    <td style={{ fontSize: '10px' }}>{formatTanggalIndo(tx.tgl)}</td>
                    <td style={{ fontSize: '12px', cursor: 'pointer' }} onClick={() => tampilkanDetailTransaksi(tx)}>
                      <strong>[{labelTipe}]</strong> {tx.ident}
                      {tx.items && tx.items.length > 0 && (
                        <>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {tx.items.map((it: any) => `${it.name} (x${it.qty})`).join(', ')}
                          </div>
                          {tx.diskon > 0 && (
                            <div style={{ fontSize: '11px', color: 'var(--orange)', marginTop: '2px', fontWeight: 'bold' }}>
                              Diskon: Rp {tx.diskon.toLocaleString('id-ID')}
                            </div>
                          )}
                          {(() => {
                            let itemHpp = tx.hppTotal || 0;
                            let itemBebanOp = tx.bebanOpTotal || 0;
                            if (itemHpp === 0 || itemBebanOp === 0) {
                              tx.items.forEach((it: any) => {
                                const m = useStore.getState().menu.find((x: any) => x.id === it.id || x.name === it.name);
                                if (m) {
                                  if (itemHpp === 0) itemHpp += (m.hppBahan || 0) * it.qty;
                                  if (itemBebanOp === 0) itemBebanOp += (m.hppOp || 0) * it.qty;
                                }
                              });
                            }
                            if (itemHpp > 0 || itemBebanOp > 0) {
                              return (
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2.5px', fontStyle: 'italic' }}>
                                  Modal Bahan: Rp {itemHpp.toLocaleString('id-ID')} | Beban Ops: Rp {itemBebanOp.toLocaleString('id-ID')}
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </>
                      )}
                    </td>
                    <td className={colorClass} style={{ fontSize: '12px', fontWeight: 'bold' }}>Rp {tx.total.toLocaleString('id-ID')}</td>
                    <td style={{ fontSize: '11px' }}>{tx.metode}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn bg-orange" style={{ padding: '4px 8px', borderRadius: '8px', fontSize: '11px', color: 'var(--text-main)' }} onClick={() => hapusTransaksi(tx)}>Hapus</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="clay-card">
        <h3 style={{ color: 'var(--text-muted)' }}>Manajemen Hutang / Kasbon</h3>
        <table>
          <thead><tr><th>Waktu (Terakhir)</th><th>Nama / Meja</th><th>Nominal</th><th style={{ textAlign: 'right' }}>Aksi</th></tr></thead>
          <tbody>
            {filteredHutang.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Tidak ada kasbon aktif.</td></tr>
            ) : (
              filteredHutang.map((h, i) => {
                const originalIdx = hutangList.findIndex(x => x.id === h.id);
                const txTerakhir = transaksiList.filter((tx: any) => tx.tipe === 'Kasbon' && tx.ident?.trim().toLowerCase() === h.nama?.trim().toLowerCase()).pop();
                const waktuTampil = txTerakhir && txTerakhir.tgl ? txTerakhir.tgl : h.tglRaw;
                
                return (
                  <tr key={h.id}>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatTanggalIndo(waktuTampil)}</td>
                    <td><strong>{h.nama}</strong></td>
                    <td className="text-red" style={{ fontWeight: 600 }}>Rp {h.sisa.toLocaleString('id-ID')}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn bg-green" style={{ padding: '6px 12px', borderRadius: '10px' }} onClick={() => bayarHutang(originalIdx)}>
                        <Check size={14} /> Bayar
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="split-layout">
        <div className="clay-card" style={{ flex: 1 }}>
          <h3 style={{ color: 'var(--text-muted)', marginBottom: '15px' }}>Catat Beban Operasional Baru</h3>
          <input type="text" className="btn-input" placeholder="Cth: Bayar Listrik, Gas" value={namaPengeluaran} onChange={e => setNamaPengeluaran(e.target.value)} />
          <input type="text" inputMode="numeric" className="btn-input" placeholder="Nominal (Rp)" value={nominalPengeluaran} onChange={e => setNominalPengeluaran(formatUang(e.target.value))} />
          <button className="btn bg-red" style={{ width: '100%', marginTop: '15px' }} onClick={tambahPengeluaran}>Catat Pengeluaran</button>
        </div>

        {posRole !== 'kasir' && (
          <div className="clay-card" style={{ flex: 1 }}>
            <h3 style={{ color: 'var(--orange)', marginBottom: '15px' }}>Tarik Prive (Kebutuhan Pribadi)</h3>
            <p style={{ fontSize: '11px', marginBottom: '10px' }}>Penarikan ini dicatat sebagai arus keluar & memotong laci kas.</p>
            <input type="text" inputMode="numeric" className="btn-input" placeholder="Nominal Tarik Prive (Rp)" value={inputPrive} onChange={e => setInputPrive(formatUang(e.target.value))} />
            <button className="btn bg-orange" style={{ width: '100%', marginTop: '15px', color: 'var(--text-main)' }} onClick={tarikPrive}>Tarik Saldo Kas</button>
            <div className="flex-between" style={{ marginTop: '15px' }}><span>Sisa Uang Di Laci:</span> <strong style={{ fontSize: '18px' }}>Rp {sisaKasLaci.toLocaleString('id-ID')}</strong></div>
          </div>
        )}
      </div>

      {posRole !== 'kasir' && (
        <>
          <div className="clay-card">
            <h3 style={{ color: 'var(--text-muted)', marginBottom: '15px' }}>Neraca Laba Bersih Komprehensif</h3>
            <div className="flex-between"><span>Penjualan Kotor (Omset - Lunas & Kasbon)</span> <strong className="text-blue">Rp {kotor.toLocaleString('id-ID')}</strong></div>
            <div className="flex-between text-orange"><span>(-) HPP (Modal Bahan Baku Terjual)</span> <strong>Rp {hppTerjual.toLocaleString('id-ID')}</strong></div>
            <div className="flex-between text-red"><span>(-) Pengeluaran Operasional (Beban)</span> <strong>Rp {op.toLocaleString('id-ID')}</strong></div>
            <hr style={{ border: 0, borderTop: '2px solid rgba(163,177,198,0.3)', margin: '15px 0' }} />
            <div className="flex-between text-green" style={{ fontSize: '18px', fontWeight: '900' }}><span>LABA BERSIH (NET)</span> <strong>Rp {bersih.toLocaleString('id-ID')}</strong></div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px', fontStyle: 'italic', lineHeight: '1.4' }}>
              * Catatan: Pembelian/Belanja Stok tidak mengurangi Laba Bersih secara langsung karena dicatat sebagai konversi Kas menjadi Aset Persediaan. Biaya bahan baku diakui secara proporsional sebagai beban (HPP) hanya saat menu makanan/minuman tersebut laku terjual.
            </div>
          </div>

          <div className="clay-card">
            <h3 style={{ fontStyle: 'italic', marginBottom: '15px' }}>Status Keseluruhan Modal & ROI (Balik Modal)</h3>
            <div className="flex-between"><span>Modal Aset (Alat/Mesin)</span> <strong>Rp {modalAset.toLocaleString('id-ID')}</strong></div>
            <div className="flex-between"><span>Modal Bahan Baku (Awal & Tambahan)</span> <strong>Rp {modalBahan.toLocaleString('id-ID')}</strong></div>
            <hr style={{ border: 0, borderTop: '1px dashed rgba(163,177,198,0.4)', margin: '10px 0' }} />
            <div className="flex-between" style={{ fontWeight: 'bold' }}><span>Total Keseluruhan Modal</span> <strong className="text-orange">Rp {totalModal.toLocaleString('id-ID')}</strong></div>
            <div className="flex-between" style={{ marginTop: '15px', fontWeight: 'bold' }}>
              <span>Estimasi Balik Modal (ROI):</span> 
              <strong className={roi > 0 ? 'text-green' : roi < 0 ? 'text-red' : 'text-muted'} style={{ fontSize: '18px' }}>
                {roi > 0 ? `+Rp ${roi.toLocaleString('id-ID')} (Untung Murni)` : roi < 0 ? `-Rp ${Math.abs(roi).toLocaleString('id-ID')} (Belum Balik)` : `Rp 0 (Break Even Point)`}
              </strong>
            </div>
          </div>
        </>
      )}
    </>
  );
}

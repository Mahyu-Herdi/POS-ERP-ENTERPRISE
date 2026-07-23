import React, { useEffect } from 'react';
import { useStore } from '../store';
import { useAppModal } from './ModalContext';

export default function TabAsetOps() {
  const { bebanAktif, updateBebanAktif, updateKeuangan, keuangan } = useStore();
  const { popup } = useAppModal();

  const kalkulasiBebanGlobal = (asetList: any[], opsList: any[], targetNum: number) => {
    let totalAsetBulan = 0;
    asetList.forEach(a => {
      totalAsetBulan += a.harga / a.umur;
    });

    let totalOpsBulan = 0;
    opsList.forEach(o => {
      totalOpsBulan += o.biaya;
    });

    const bebanPerPorsi = targetNum > 0 ? (totalAsetBulan + totalOpsBulan) / targetNum : 0;
    const roundedPerPorsi = Math.round(bebanPerPorsi);
    if (bebanAktif.target !== targetNum || bebanAktif.perPorsi !== roundedPerPorsi) {
      updateBebanAktif({ target: targetNum, perPorsi: roundedPerPorsi });
    }
  };

  useEffect(() => {
    kalkulasiBebanGlobal(bebanAktif.aset, bebanAktif.ops, bebanAktif.target);
  }, [bebanAktif.aset.length, bebanAktif.ops.length, bebanAktif.target]);

  const tambahAset = async () => {
    const nama = await popup('prompt_text', "Nama Aset (Cth: Mesin Espresso, Kipas):", "Data Aset Baru");
    if (!nama) return;
    const harga = await popup('prompt_num', `Harga beli ${nama}?`, "Harga Aset");
    if (harga === false) return;
    const umur = await popup('prompt_num', `Estimasi masa pakai (Bulan)? Cth: 36 bulan`, "Umur Aset");
    if (umur === false) return;

    const newAset = [...bebanAktif.aset, { nama, harga, umur }];
    updateBebanAktif({ aset: newAset });
    kalkulasiBebanGlobal(newAset, bebanAktif.ops, bebanAktif.target);
  };

  const hapusAset = (idx: number) => {
    const newAset = [...bebanAktif.aset];
    const deleted = newAset.splice(idx, 1)[0];
    
    updateBebanAktif({ aset: newAset });
    kalkulasiBebanGlobal(newAset, bebanAktif.ops, bebanAktif.target);
  };

  const tambahOps = async () => {
    const nama = await popup('prompt_text', "Nama Beban Bulanan (Cth: Wifi / Listrik):", "Beban Bulanan");
    if (!nama) return;
    const biaya = await popup('prompt_num', `Biaya per bulan untuk ${nama}?`, "Biaya Bulanan");
    if (biaya === false) return;

    const newOps = [...bebanAktif.ops, { nama, biaya }];
    updateBebanAktif({ ops: newOps });
    kalkulasiBebanGlobal(bebanAktif.aset, newOps, bebanAktif.target);
  };

  const hapusOps = (idx: number) => {
    const newOps = [...bebanAktif.ops];
    const deleted = newOps.splice(idx, 1)[0];
    
    updateBebanAktif({ ops: newOps });
    kalkulasiBebanGlobal(bebanAktif.aset, newOps, bebanAktif.target);
  };

  return (
    <>
      <h3 style={{ marginBottom: '5px', textAlign: 'center', color: 'var(--text-main)' }}>Konfigurasi Beban Aset & Ops</h3>
      <p style={{ fontSize: '11px', textAlign: 'center', marginBottom: '20px', color: 'var(--text-muted)' }}>Sistem akan menghitung beban fix per porsi secara otomatis.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="flex-between">
        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>1. Daftar Penyusutan Aset Toko</span>
        <button className="btn bg-blue" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={tambahAset}>
           <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Aset
        </button>
      </div>
      <table>
        <tbody>
          {bebanAktif.aset.length === 0 ? (
            <tr><td colSpan={3} style={{ fontSize: '11px', textAlign: 'center' }}>Belum ada aset</td></tr>
          ) : (
            bebanAktif.aset.map((a, i) => (
              <tr key={i}>
                <td style={{ fontSize: '11px' }}>
                  <strong>{a.nama}</strong><br />
                  <span style={{ color: 'var(--text-muted)' }}>Beli: Rp {(a.harga || 0).toLocaleString('id-ID')}</span><br />
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Masa Manfaat: {a.umur || 0} bln</span>
                </td>
                <td style={{ fontSize: '11px', textAlign: 'right' }}>
                  Rp {Math.round(a.harga / (a.umur || 1)).toLocaleString('id-ID')}/bln
                  <br />
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                    Rp {Math.round((a.harga / (a.umur || 1)) / 30).toLocaleString('id-ID')}/hari
                  </span>
                </td>
                <td><button className="btn bg-red" style={{ padding: '4px' }} onClick={() => hapusAset(i)}>x</button></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
        </div>

        <div>
          <div className="flex-between" style={{ marginTop: '0px' }}>
        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>2. Beban Operasional Bulanan</span>
        <button className="btn bg-blue" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={tambahOps}>
           <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Beban
        </button>
      </div>
      <table>
        <tbody>
          {bebanAktif.ops.length === 0 ? (
            <tr><td colSpan={3} style={{ fontSize: '11px', textAlign: 'center' }}>Belum ada beban bulanan</td></tr>
          ) : (
            bebanAktif.ops.map((o, i) => (
              <tr key={i}>
                <td style={{ fontSize: '11px' }}>{o.nama}</td>
                <td style={{ fontSize: '11px' }}>
                  Rp {o.biaya.toLocaleString('id-ID')}/bln 
                  <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>
                    (Rp {Math.round(o.biaya / 30).toLocaleString('id-ID')}/hari)
                  </span>
                </td>
                <td><button className="btn bg-red" style={{ padding: '4px' }} onClick={() => hapusOps(i)}>x</button></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
        </div>
      </div>

      <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginTop: '20px' }}>3. Target Penjualan Sebulan (Porsi/Cup)</label>
      <input 
        type="number" 
        className="btn-input" 
        placeholder="Cth: 1000" 
        value={bebanAktif.target} 
        onChange={e => {
          const val = parseInt(e.target.value, 10) || 1;
          kalkulasiBebanGlobal(bebanAktif.aset, bebanAktif.ops, val);
        }} 
      />

      <div className="clay-card bg-dim" style={{ marginTop: '20px', padding: '15px', textAlign: 'center' }}>
        <span style={{ fontSize: '12px' }}>Total Beban Tetap (Per Porsi):</span>
        <h2 className="text-blue" style={{ marginTop: '5px' }}>Rp {bebanAktif.perPorsi.toLocaleString('id-ID')}</h2>
        <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '5px' }}>Angka ini yang akan ditarik ke HPP saat klik tombol Auto.</p>
      </div>
    </>
  );
}

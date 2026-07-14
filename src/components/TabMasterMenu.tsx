import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useAppModal } from './ModalContext';
import { motion, AnimatePresence } from 'motion/react';

export default function TabMasterMenu() {
  const { stokData, tempResep, setTempResep, menu, setMenu, bebanAktif, cart, setCart } = useStore();
  const [hppNama, setHppNama] = useState('');
  const [resepSelect, setResepSelect] = useState('');
  const [isResepOpen, setIsResepOpen] = useState(false);
  const [resepQty, setResepQty] = useState('');
  const [hppBahan, setHppBahan] = useState(0);
  const [hppOp, setHppOp] = useState('');
  const [hppJual, setHppJual] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const { popup } = useAppModal();

  useEffect(() => {
    if (!isResepOpen) {
      setSearchTerm('');
    }
  }, [isResepOpen]);

  const filteredStokData = stokData.filter(s =>
    s.nama.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const parseAngka = (val: string) => parseInt(val.toString().replace(/\D/g, ''), 10) || 0;
  
  const formatUang = (val: string) => {
    const num = parseAngka(val);
    if (isNaN(num) || num === 0) return '';
    return num.toLocaleString('id-ID');
  };

  const tambahBahanKeResep = () => {
    const qty = parseFloat(resepQty) || 0;
    if (!resepSelect || qty <= 0) return;

    const sItem = stokData.find(s => s.id === resepSelect);
    if (!sItem) return;

    const newTempResep = [...tempResep];
    const exist = newTempResep.find(r => r.stokId === resepSelect);
    if (exist) {
      exist.qty += qty;
    } else {
      newTempResep.push({ stokId: resepSelect, nama: sItem.nama, qty, unit: sItem.unit, hargaPerUnit: sItem.hargaPerUnit });
    }
    
    setTempResep(newTempResep);
    setResepQty('');
    
    const newHppBahan = newTempResep.reduce((acc, r) => acc + (r.qty * r.hargaPerUnit), 0);
    setHppBahan(newHppBahan);
  };

  const hapusBahanTemp = (idx: number) => {
    const newTempResep = [...tempResep];
    newTempResep.splice(idx, 1);
    setTempResep(newTempResep);
    const newHppBahan = newTempResep.reduce((acc, r) => acc + (r.qty * r.hargaPerUnit), 0);
    setHppBahan(newHppBahan);
  };

  const simpanMenu = async () => {
    const jual = parseAngka(hppJual);
    if (!hppNama || jual <= 0) {
      await popup('alert', 'Pastikan mengisi Nama dan Harga Jual!', "Gagal");
      return;
    }

    const newMenu = [...menu];
    newMenu.push({ id: 'm' + Date.now(), name: hppNama, harga: jual, resep: [...tempResep], hppBahan: hppBahan, hppOp: opNum });
    setMenu(newMenu);
    
    setTempResep([]);
    setHppNama('');
    setHppBahan(0);
    setHppOp('');
    setHppJual('');
    await popup('alert', `Katalog menu ${hppNama} berhasil disimpan!`, "Sukses");
  };

  // Sanitize tempResep on stokData change
  useEffect(() => {
    const cleanedResep = tempResep.filter(r => stokData.some(s => s.id === r.stokId));
    if (cleanedResep.length !== tempResep.length) {
      setTempResep(cleanedResep);
      const newHppBahan = cleanedResep.reduce((acc, r) => acc + (r.qty * r.hargaPerUnit), 0);
      setHppBahan(newHppBahan);
    }
  }, [stokData]);

  const hapusMenu = async (id: string) => {
    if (await popup('confirm', 'Hapus menu ini dari sistem kasir?', "Hapus Menu")) {
      const newMenu = menu.filter(m => m.id !== id);
      setMenu(newMenu);
      const newCart = cart.filter(c => c.id !== id);
      if (newCart.length !== cart.length) setCart(newCart);
    }
  };

  const opNum = parseAngka(hppOp);
  const jualNum = parseAngka(hppJual);
  const profit = jualNum - (hppBahan + opNum);
  const margin = jualNum > 0 ? (profit / jualNum) * 100 : 0;
  const selectedStokItem = stokData.find(s => s.id === resepSelect);

  return (
    <>
      <h3 style={{ marginBottom: '15px', textAlign: 'center', color: 'var(--text-main)' }}>Kalkulator HPP & Buat Menu</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-dim" style={{ padding: '15px', borderRadius: '15px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Nama Menu Baru</label>
      <input type="text" className="btn-input" placeholder="Cth: Kopi Arabika Susu" value={hppNama} onChange={e => setHppNama(e.target.value)} />
      
      <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginTop: '15px' }}>Master Resep Bahan Baku (Ditarik dari Data Stok)</label>
      <div style={{ display: 'flex', gap: '10px', marginTop: '5px', zIndex: 120, position: 'relative' }}>
        <div style={{ flex: 2, position: 'relative' }}>
          <div 
            onClick={() => setIsResepOpen(!isResepOpen)}
            className="btn-input" 
            style={{ 
              margin: 0, 
              cursor: 'pointer', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              padding: '12px 16px',
              boxShadow: isResepOpen ? 'var(--clay-shadow-out)' : 'var(--clay-shadow-in)',
              border: isResepOpen ? 'var(--clay-border)' : 'var(--input-border)',
              fontSize: '13px',
              height: '100%',
              minHeight: '46px'
            }}
          >
            <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedStokItem ? `${selectedStokItem.nama} (Rp ${selectedStokItem.hargaPerUnit}/${selectedStokItem.unit})` : '-- Pilih Komponen Bahan --'}
            </span>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" style={{ transform: isResepOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', flexShrink: 0 }}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>

          <AnimatePresence>
            {isResepOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '6px',
                  background: 'var(--clay-bg)',
                  boxShadow: 'var(--clay-shadow-out)',
                  border: 'var(--clay-border)',
                  borderRadius: '16px',
                  padding: '6px',
                  zIndex: 200,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  maxHeight: '260px',
                  overflowY: 'auto'
                }}
              >
                <div style={{ padding: '4px', position: 'sticky', top: 0, background: 'var(--clay-bg)', zIndex: 10 }}>
                  <input
                    type="text"
                    placeholder="Cari bahan baku..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="btn-input"
                    style={{
                      margin: 0,
                      padding: '8px 12px',
                      fontSize: '12px',
                      width: '100%',
                      background: 'var(--input-bg)'
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                </div>
                <div
                  onClick={() => {
                    setResepSelect('');
                    setIsResepOpen(false);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                    background: resepSelect === '' ? 'var(--input-bg)' : 'transparent',
                    transition: 'background 0.2s'
                  }}
                >
                  -- Pilih Komponen Bahan --
                </div>
                {filteredStokData.map(s => (
                  <div
                    key={s.id}
                    onClick={() => {
                      setResepSelect(s.id);
                      setIsResepOpen(false);
                    }}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '13px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: resepSelect === s.id ? 'var(--input-bg)' : 'transparent',
                      color: 'var(--text-main)',
                      transition: 'background 0.2s'
                    }}
                  >
                    <span>{s.nama} (Rp {s.hargaPerUnit}/{s.unit})</span>
                    {resepSelect === s.id && (
                      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="3" fill="none">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    )}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <input type="number" step="any" className="btn-input" style={{ margin: 0, flex: 1, fontSize: '13px' }} placeholder="Jumlah" value={resepQty} onChange={e => setResepQty(e.target.value)} />
        <button className="btn bg-blue" style={{ margin: 0, padding: '12px 16px' }} onClick={tambahBahanKeResep}>+</button>
      </div>

      <div style={{ marginTop: '10px', fontSize: '12px', background: 'rgba(0,0,0,0.03)', padding: '12px', borderRadius: '12px', minHeight: '40px' }}>
        {tempResep.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>Belum ada resep bahan baku.</span>
        ) : (
          tempResep.map((r, idx) => (
            <div key={idx} className="flex-between" style={{ marginBottom: '5px', background: 'rgba(0,0,0,0.02)', padding: '4px 8px', borderRadius: '6px' }}>
              <span>{r.nama} - {r.qty} {r.unit} (@Rp {r.hargaPerUnit})</span>
              <span>
                Rp {Math.round(r.qty * r.hargaPerUnit).toLocaleString('id-ID')}
                <button className="btn bg-red" style={{ padding: '2px 6px', fontSize: '10px', borderRadius: '4px', display: 'inline-block', marginLeft: '5px' }} onClick={() => hapusBahanTemp(idx)}>x</button>
              </span>
            </div>
          ))
        )}
      </div>
        </div>

        <div className="bg-dim" style={{ padding: '15px', borderRadius: '15px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block' }}>Modal Beli / Bahan Baku per Porsi (Rp)</label>
      <input type="text" className="btn-input" placeholder="Otomatis terhitung dari resep..." readOnly style={{ background: 'rgba(0,0,0,0.05)', fontWeight: 'bold' }} value={hppBahan.toLocaleString('id-ID')} />
      
      <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginTop: '15px' }}>Beban Operasional & Penyusutan / Porsi (Rp)</label>
      <div style={{ display: 'flex', gap: '10px' }}>
        <input type="text" inputMode="numeric" className="btn-input" placeholder="Cth: 1.500" value={hppOp} onChange={e => setHppOp(formatUang(e.target.value))} />
        <button className="btn bg-orange" style={{ marginTop: '5px', fontSize: '12px', padding: '12px' }} onClick={() => setHppOp(bebanAktif.perPorsi.toLocaleString('id-ID'))}>
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> Auto
        </button>
      </div>

      <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginTop: '15px' }}>Harga Jual Final Ke Pelanggan (Rp)</label>
      <input type="text" inputMode="numeric" className="btn-input" placeholder="Cth: 15.000" value={hppJual} onChange={e => setHppJual(formatUang(e.target.value))} />

      <div className="clay-card bg-dim" style={{ marginTop: '20px', padding: '15px', textAlign: 'center', boxShadow: 'none', border: '1px solid rgba(163,177,198,0.2)' }}>
        <div className="flex-between"><span>Profit Bersih:</span> <strong>Rp {profit.toLocaleString('id-ID')}</strong></div>
        <div className="flex-between"><span>Margin Laba:</span> <strong className={margin < 50 ? 'text-red' : 'text-blue'}>{margin.toFixed(1)}%</strong></div>
        
        {margin < 50 && margin > 0 && (
          <div style={{ fontSize: '11px', marginTop: '10px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }} className="text-red">
            Margin Berisiko! Keuntungan &lt; 50%
          </div>
        )}
      </div>

      <button className="btn bg-green" style={{ width: '100%', marginTop: '15px' }} onClick={simpanMenu}>Simpan Menu Ke Sistem</button>
        </div>
      </div>

      <h4 style={{ marginTop: '30px', marginBottom: '10px', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>Daftar Menu Tersimpan</h4>
      <div>
        {menu.length === 0 ? (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Katalog kosong.</span>
        ) : (
          menu.map(m => (
            <div key={m.id} className="flex-between" style={{ borderBottom: '1px dashed rgba(163,177,198,0.3)', padding: '10px 0' }}>
              <div style={{ fontSize: '14px' }}>
                <strong>{m.name}</strong> <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({m.resep && m.resep.length > 0 ? `${m.resep.length} Bahan baku` : 'Tanpa resep'})</span> 
                <br /><span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Modal Bahan: Rp {(m.hppBahan || 0).toLocaleString('id-ID')} | Beban Ops: Rp {(m.hppOp || 0).toLocaleString('id-ID')}</span>
                <br /><span className="text-blue" style={{ fontSize: '12px' }}>Harga Jual: Rp {m.harga.toLocaleString('id-ID')}</span>
              </div>
              <button className="btn bg-red" style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '10px' }} onClick={() => hapusMenu(m.id)}>Hapus</button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

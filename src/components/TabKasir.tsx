import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useAppModal } from './ModalContext';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { generateDynamicQRIS } from '../utils/qris';

export default function TabKasir() {
  const { menu, cart, addToCart, updateCartQty, toggleCartBayar, setOrderMode, orderMode, mejaAktif, setMejaAktif, totalMeja, addTransaksi, keuangan, updateKeuangan, stokData, updateStok, addStokHistory, addHutang, toko, transaksiList } = useStore();
  const [search, setSearch] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [diskon, setDiskon] = useState('0');
  const [metodeBayar, setMetodeBayar] = useState('Cash');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [uangBayar, setUangBayar] = useState('');
  const [showPilihMeja, setShowPilihMeja] = useState(false);
  const [showQrisModal, setShowQrisModal] = useState(false);
  const [dynamicQris, setDynamicQris] = useState('');
  const { popup } = useAppModal();

  useEffect(() => {
    const handleIdentifier = (e: any) => setIdentifier(e.detail);
    window.addEventListener('setIdentifier', handleIdentifier);
    return () => window.removeEventListener('setIdentifier', handleIdentifier);
  }, []);

  const getToday = () => new Date().toISOString().split('T')[0];

  const cetakStruk = (txRecord: any) => {
    window.dispatchEvent(new CustomEvent('print-receipt', { detail: txRecord }));
  };

  const formatUang = (val: string) => {
    const num = parseInt(val.replace(/\D/g, ''), 10);
    if (isNaN(num)) return '';
    return num.toLocaleString('id-ID');
  };

  const parseAngka = (val: string) => parseInt(val.replace(/\D/g, ''), 10) || 0;

  const orderFrequencies = React.useMemo(() => {
    const freqs: Record<string, number> = {};
    transaksiList.forEach(tx => {
      if (tx.tipe === 'Penjualan' || tx.tipe === 'Kasbon') {
        tx.items?.forEach((item: any) => {
          if (item.id) {
            freqs[item.id] = (freqs[item.id] || 0) + item.qty;
          }
        });
      }
    });
    return freqs;
  }, [transaksiList]);

  const filteredMenu = menu
    .filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (orderFrequencies[b.id] || 0) - (orderFrequencies[a.id] || 0));

  const subtotal = cart.reduce((acc, c) => acc + (c.bayar ? c.harga * c.qty : 0), 0);
  const diskonNum = parseAngka(diskon);
  const total = Math.max(0, subtotal - diskonNum);
  const uang = uangBayar.trim() === '' ? total : parseAngka(uangBayar);
  const kembalian = Math.max(0, uang - total);

  const setMode = (mode: string) => {
    setOrderMode(mode);
    if (mode === 'Takeaway') {
      setIdentifier('');
      useStore.getState().clearCart();
    }
  };

  const simpanMejaUpdate = async () => {
    if (orderMode !== 'Dine-In' || cart.length === 0) {
      await popup('alert', "Fungsi ini untuk pesanan Dine-In yang belum bayar.", "Simpan Gagal");
      return;
    }
    const mName = identifier.split('-')[0].trim();
    const mejaIdx = mejaAktif.findIndex(m => m.meja === mName);
    
    const newMejaAktif = [...mejaAktif];
    if (mejaIdx >= 0) {
      newMejaAktif[mejaIdx].items = [...cart];
      newMejaAktif[mejaIdx].namaIdentitas = identifier;
    } else {
      newMejaAktif.push({ meja: mName, namaIdentitas: identifier, items: [...cart] });
    }
    
    setMejaAktif(newMejaAktif);
    useStore.getState().clearCart();
    setIdentifier('');
    setMode('Takeaway');
    await popup('alert', `Pesanan ${mName} berhasil disimpan/diupdate!`, "Tersimpan");
  };

  const executeCheckout = async () => {
    const ident = identifier || 'Pelanggan Umum';
    const itemsPaid = cart.filter(c => c.bayar);
    const txId = Date.now();
    let newHppTerjual = keuangan.hppTerjual;
    let hppTx = 0;
    let bebanOpTx = 0;
    itemsPaid.forEach(cartItem => {
      const masterMenu = menu.find(m => m.id === cartItem.id);
      if (masterMenu) {
        let itemHppTotal = 0;
        if (masterMenu.resep && masterMenu.resep.length > 0) {
          masterMenu.resep.forEach((r: any) => {
            const stokItem = stokData.find(s => s.id === r.stokId);
            const currentPrice = stokItem ? stokItem.hargaPerUnit : r.hargaPerUnit;
            const hppItem = (currentPrice * r.qty * cartItem.qty);
            itemHppTotal += hppItem;
            
            if (stokItem) {
              const totalTerpakai = r.qty * cartItem.qty;
              const newSisa = Math.max(0, stokItem.sisa - totalTerpakai);
              const sIdx = stokData.findIndex(s => s.id === stokItem.id);
              if (sIdx >= 0) updateStok(sIdx, { sisa: newSisa });
              addStokHistory({
                id: 'h' + Date.now() + Math.random().toString(36).substring(2, 6),
                stokId: stokItem.id,
                nama: stokItem.nama,
                item: stokItem.nama,
                tipe: 'Keluar (Penjualan)',
                qty: totalTerpakai,
                sisaSebelum: stokItem.sisa,
                sisaSetelah: newSisa,
                tgl: new Date().toISOString(),
                keterangan: '',
                txId: txId
              });
            }
          });
        } else if (masterMenu.hppBahan) {
           itemHppTotal = masterMenu.hppBahan * cartItem.qty;
        }
        
        newHppTerjual += itemHppTotal;
        hppTx += itemHppTotal;
        bebanOpTx += (masterMenu.hppOp || 0) * cartItem.qty;
      }
    });
    updateKeuangan({ hppTerjual: newHppTerjual });

    const txRecord = {
      id: txId,
      tgl: new Date().toLocaleString('id-ID'),
      tglRaw: getToday(),
      tipe: metodeBayar === 'Hutang' ? 'Kasbon' : 'Penjualan',
      ident,
      items: itemsPaid,
      subtotal,
      diskon: diskonNum,
      total,
      bayar: metodeBayar === 'Cash' ? uang : total,
      metode: metodeBayar,
      hppTotal: hppTx,
      bebanOpTotal: bebanOpTx
    };

    if (metodeBayar === 'Hutang') {
      addHutang({ id: txId, nama: ident, nominal: total, sisa: total, pembayaran: [], tglRaw: getToday() });
      await popup('alert', `Transaksi dicatat sebagai Kasbon atas nama ${ident}`, "Sukses");
    } else {
      updateKeuangan({ masuk: keuangan.masuk + total });
      const print = await popup('print_confirm', `Pembayaran via ${metodeBayar} Lunas! Cetak struk untuk pelanggan ini?`, "Pembayaran Berhasil");
      if (print) {
        cetakStruk(txRecord);
      }
    }

    addTransaksi(txRecord);

    const mName = ident.split('-')[0].trim();
    const remainingCart = cart.filter(c => !c.bayar);
    
    let newMejaAktif = [...mejaAktif];
    if (remainingCart.length === 0) {
      newMejaAktif = newMejaAktif.filter(m => m.meja !== mName && m.meja !== ident);
      setIdentifier('');
      setMode('Takeaway');
    } else {
      const mejaIdx = newMejaAktif.findIndex(m => m.meja === mName);
      if (mejaIdx >= 0) newMejaAktif[mejaIdx].items = remainingCart;
    }
    
    useStore.getState().setCart(remainingCart);
    setMejaAktif(newMejaAktif);
    setUangBayar('');
    setDiskon('0');
  };

  const checkout = async () => {
    const itemsPaid = cart.filter(c => c.bayar);

    if (itemsPaid.length === 0) {
      await popup('alert', "Pilih pesanan yang mau dibayar dulu ya!", "Gagal");
      return;
    }

    if (metodeBayar === 'QRIS') {
      if (!toko.qrisStatis) {
        await popup('alert', "QRIS Statis belum dikonfigurasi. Silakan masuk ke tab Toko & Sistem untuk mengunggah gambar QRIS Statis terlebih dahulu.", "QRIS Belum Di-set");
        return;
      }
      try {
        const itemsSummary = itemsPaid.map(c => `${c.name} x${c.qty}`).join(', ');
        const payload = generateDynamicQRIS(toko.qrisStatis, total, itemsSummary);
        if (!payload) {
          await popup('alert', "Gagal menghasilkan QRIS Dinamis. Silakan periksa kembali format payload QRIS Statis Anda.", "Error QRIS");
          return;
        }
        setDynamicQris(payload);
        setShowQrisModal(true);
      } catch (err) {
        console.error(err);
        await popup('alert', "Terjadi kesalahan saat memproses QRIS Dinamis.", "Error");
      }
    } else {
      await executeCheckout();
    }
  };

  const pilihMejaDariModal = (mejaName: string) => {
    setShowPilihMeja(false);
    const md = mejaAktif.find(m => m.meja === mejaName);
    setIdentifier(md ? md.namaIdentitas : (mejaName + " - "));
    useStore.getState().setCart(md ? JSON.parse(JSON.stringify(md.items)) : []);
  };

  return (
    <>
      {showPilihMeja && (
        <div className="modal-overlay active">
          <div className="clay-card modal-box" style={{ margin: 'auto' }}>
            <h3 style={{ textAlign: 'center', marginBottom: '15px', color: 'var(--text-main)' }}>Pilih Meja Pelanggan</h3>
            <p style={{ fontSize: '11px', textAlign: 'center', color: 'var(--text-muted)', marginBottom: '15px' }}>Meja merah artinya sedang ada pelanggan. Klik untuk edit pesanan.</p>
            <div className="grid-view" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
              {Array.from({ length: totalMeja }).map((_, i) => {
                const num = i + 1;
                const tName = `Meja ${num < 10 ? '0' : ''}${num}`;
                const md = mejaAktif.find(m => m.meja === tName);
                const color = md ? 'var(--red)' : 'var(--green)';
                const text = md ? `${md.items.length} Item` : 'Kosong (Pilih)';
                return (
                  <div key={tName} className="btn" style={{ padding: '15px 10px', flexDirection: 'column', gap: '5px' }} onClick={() => pilihMejaDariModal(tName)}>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{tName}</div>
                    <div style={{ fontSize: '11px', color }}>{text}</div>
                  </div>
                );
              })}
            </div>
            <button className="btn bg-dim" style={{ width: '100%', marginTop: '20px', color: 'var(--text-main)' }} onClick={() => setShowPilihMeja(false)}>Batal</button>
          </div>
        </div>
      )}

      {showQrisModal && (
        <div className="modal-overlay active" style={{ zIndex: 9999 }}>
          <div className="clay-card modal-box" style={{ margin: 'auto', maxWidth: '400px', width: '90%', textAlign: 'center', padding: '25px' }}>
            <h3 style={{ marginBottom: '10px', color: 'var(--text-main)', fontSize: '18px', fontWeight: 'bold' }}>QRIS Dinamis Otomatis</h3>
            
            <div style={{ padding: '8px 15px', background: 'var(--input-bg)', borderRadius: '12px', display: 'inline-block', marginBottom: '15px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold', display: 'block', letterSpacing: '0.5px' }}>TOTAL TAGIHAN</span>
              <h2 className="text-blue" style={{ margin: 0, fontWeight: 900, fontSize: '22px' }}>Rp {total.toLocaleString('id-ID')}</h2>
            </div>

            {/* RINCIAN PESANAN DIBAYAR */}
            <div style={{ 
              maxHeight: '110px', 
              overflowY: 'auto', 
              textAlign: 'left', 
              background: 'rgba(163, 177, 198, 0.08)', 
              borderRadius: '12px', 
              padding: '10px 12px', 
              marginBottom: '15px',
              border: '1px solid rgba(163, 177, 198, 0.15)'
            }}>
              <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '6px', borderBottom: '1px dashed rgba(163, 177, 198, 0.2)', paddingBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                <span>RINCIAN PESANAN</span>
                <span>{cart.filter(c => c.bayar).length} Item</span>
              </div>
              {cart.filter(c => c.bayar).map((c, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-main)', margin: '4px 0' }}>
                  <span style={{ fontWeight: '500' }}>
                    {c.name} <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>x{c.qty}</span>
                  </span>
                  <span className="font-mono" style={{ fontSize: '11px' }}>Rp {(c.harga * c.qty).toLocaleString('id-ID')}</span>
                </div>
              ))}
              {diskonNum > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--red)', marginTop: '4px', borderTop: '1px dashed rgba(163, 177, 198, 0.2)', paddingTop: '4px' }}>
                  <span>Diskon</span>
                  <span className="font-mono">-Rp {diskonNum.toLocaleString('id-ID')}</span>
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '15px' }}>
              <div style={{ background: '#ffffff', padding: '15px', borderRadius: '20px', display: 'inline-block', boxShadow: '0 4px 15px rgba(0,0,0,0.08)' }}>
                <QRCodeSVG value={dynamicQris} size={200} includeMargin={true} />
              </div>
            </div>
            
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4', margin: '0 10px 25px 10px' }}>
              Silakan minta pelanggan memindai QR Code di atas menggunakan aplikasi m-banking atau e-wallet (GoPay, OVO, Dana, ShopeePay, dll) untuk menyelesaikan pembayaran.
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn bg-dim" 
                style={{ flex: 1, margin: 0, padding: '12px', color: 'var(--text-main)', fontSize: '12px' }} 
                onClick={() => setShowQrisModal(false)}
              >
                Kembali
              </button>
              <button 
                className="btn bg-green" 
                style={{ flex: 1.5, margin: 0, padding: '12px', color: 'var(--text-main)', fontWeight: 'bold', fontSize: '12px' }} 
                onClick={async () => {
                  setShowQrisModal(false);
                  await executeCheckout();
                }}
              >
                Selesai / Lunas
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="split-layout">
        <div className="left-panel">
          <div className="clay-card">
            <div className="flex-between">
              <h3 style={{ color: 'var(--text-muted)' }}>Menu Pesanan</h3>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn bg-blue" onClick={() => { setOrderMode('Dine-In'); setShowPilihMeja(true); }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 18h16V6H4v12zm9-10h5v3h-5V8zm-7 0h5v5H6V8zm0 7h5v1h-5v-1zm7-2h5v3h-5v-3z"/></svg> Dine-In
                </button>
                <button className="btn bg-green" onClick={() => setMode('Takeaway')}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3z"/></svg> Takeaway
                </button>
              </div>
            </div>
            <input 
              type="text" 
              className="btn-input" 
              placeholder={orderMode === 'Takeaway' ? 'Ketik Nama Pelanggan Takeaway' : 'Pilih mode Dine-in / Takeaway'} 
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
            />
            
            <div style={{ margin: '15px 0' }}>
              <input 
                type="text" 
                className="btn-input" 
                placeholder="Cari pesanan..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="grid-view">
              {filteredMenu.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '10px' }}>Belum ada menu tersimpan.</p>
              ) : (
                filteredMenu.map(m => (
                  <div key={m.id} className="btn" style={{ textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }} onClick={() => addToCart(m)}>
                    <div style={{ fontSize: '13px', fontWeight: 900 }}>{m.name}</div>
                    <div className="text-blue" style={{ fontSize: '12px', fontWeight: 900 }}>Rp {m.harga.toLocaleString('id-ID')}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        <div className="right-panel">
          <div className="clay-card">
            <h3 style={{ color: 'var(--text-muted)', marginBottom: '15px' }}>Keranjang & Pembayaran</h3>
            <div style={{ marginBottom: '20px' }}>
              {cart.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>Keranjang Kosong</p>
              ) : (
                cart.map((c, idx) => (
                  <div key={`${c.id}-${idx}`} className="bg-dim" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderRadius: '15px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input type="checkbox" checked={c.bayar} onChange={() => toggleCartBayar(idx)} style={{ width: '20px', height: '20px' }} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 900 }}>{c.name}</div>
                        <div className="text-muted" style={{ fontSize: '11px', marginTop: '4px', fontWeight: 900 }}>Rp {c.harga.toLocaleString('id-ID')}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button className="btn" style={{ padding: '6px 12px', borderRadius: '10px' }} onClick={() => updateCartQty(idx, -1)}>
                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                      </button>
                      <strong style={{ fontSize: '15px', minWidth: '20px', textAlign: 'center', fontWeight: 900 }}>{c.qty}</strong>
                      <button className="btn" style={{ padding: '6px 12px', borderRadius: '10px' }} onClick={() => updateCartQty(idx, 1)}>
                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="flex-between"><span>Subtotal</span> <strong style={{ fontWeight: 900 }}>Rp {subtotal.toLocaleString('id-ID')}</strong></div>
            <div className="flex-between">
              <span>Diskon (Rp)</span>
              <input type="text" inputMode="numeric" className="btn-input font-extrabold" style={{ width: '120px', textAlign: 'right', margin: 0, fontWeight: 900 }} value={diskon} onChange={e => setDiskon(formatUang(e.target.value) || '0')} />
            </div>
            <hr style={{ border: 0, borderTop: '2px solid rgba(163,177,198,0.3)', margin: '15px 0' }} />
            <div className="flex-between text-blue" style={{ fontSize: '20px' }}>
              <strong style={{ fontWeight: 900 }}>Total Akhir</strong> <strong style={{ fontWeight: 900 }}>Rp {total.toLocaleString('id-ID')}</strong>
            </div>

            <div style={{ position: 'relative', marginTop: '15px', zIndex: 100 }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Metode Pembayaran</label>
              <div 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="btn-input" 
                style={{ 
                  margin: 0, 
                  cursor: 'pointer', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '12px 16px',
                  boxShadow: isDropdownOpen ? 'var(--clay-shadow-out)' : 'var(--clay-shadow-in)',
                  border: isDropdownOpen ? 'var(--clay-border)' : 'var(--input-border)'
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {metodeBayar === 'Cash' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
                        <rect x="2" y="6" width="20" height="12" rx="2" />
                        <circle cx="12" cy="12" r="2" />
                        <path d="M6 12h.01M18 12h.01" />
                      </svg>
                      Tunai / Cash
                    </span>
                  )}
                  {metodeBayar === 'QRIS' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                        <rect x="14" y="14" width="3" height="3" />
                        <rect x="18" y="18" width="3" height="3" />
                        <path d="M21 14h-3v3M14 21h3v-3M14 17h4v4h-4z" />
                      </svg>
                      QRIS Dinamis
                    </span>
                  )}
                  {metodeBayar === 'Hutang' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <line x1="10" y1="9" x2="8" y2="9" />
                      </svg>
                      Kasbon / Hutang
                    </span>
                  )}
                </span>
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>

              <AnimatePresence>
                {isDropdownOpen && (
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
                      zIndex: 110,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    {[
                      { 
                        value: 'Cash', 
                        label: 'Tunai / Cash',
                        icon: (
                          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="6" width="20" height="12" rx="2" />
                            <circle cx="12" cy="12" r="2" />
                            <path d="M6 12h.01M18 12h.01" />
                          </svg>
                        )
                      },
                      { 
                        value: 'QRIS', 
                        label: 'QRIS Dinamis',
                        icon: (
                          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="7" />
                            <rect x="14" y="3" width="7" height="7" />
                            <rect x="3" y="14" width="7" height="7" />
                            <rect x="14" y="14" width="3" height="3" />
                            <rect x="18" y="18" width="3" height="3" />
                            <path d="M21 14h-3v3M14 21h3v-3M14 17h4v4h-4z" />
                          </svg>
                        )
                      },
                      { 
                        value: 'Hutang', 
                        label: 'Kasbon / Hutang',
                        icon: (
                          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <line x1="10" y1="9" x2="8" y2="9" />
                          </svg>
                        )
                      }
                    ].map((opt) => (
                      <div
                        key={opt.value}
                        onClick={() => {
                          setMetodeBayar(opt.value);
                          setIsDropdownOpen(false);
                        }}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: metodeBayar === opt.value ? 'var(--input-bg)' : 'transparent',
                          color: 'var(--text-main)',
                          transition: 'background 0.2s'
                        }}
                        className="dropdown-item"
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {opt.icon}
                          {opt.label}
                        </span>
                        {metodeBayar === opt.value && (
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

            {metodeBayar === 'Cash' && (
              <div style={{ marginTop: '20px' }}>
                <input type="text" inputMode="numeric" className="btn-input" placeholder="Uang Dibayar (Cash)" value={uangBayar} onChange={e => setUangBayar(formatUang(e.target.value))} />
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                  {[100000, 50000, 20000, 10000, 5000].map(amount => (
                    <button 
                      key={amount}
                      onClick={() => setUangBayar(formatUang(amount.toString()))}
                      className="btn-shortcut"
                      style={{ 
                        flex: '0 0 auto', 
                        padding: '6px 12px', 
                        fontSize: '12px', 
                        borderRadius: '16px', 
                        border: '1px solid var(--border)', 
                        background: 'var(--bg-card)',
                        color: 'var(--text)',
                        cursor: 'pointer'
                      }}
                    >
                      {amount.toLocaleString('id-ID')}
                    </button>
                  ))}
                  <button 
                    onClick={() => setUangBayar(formatUang(total.toString()))}
                    className="btn-shortcut"
                    style={{ 
                      flex: '0 0 auto', 
                      padding: '6px 12px', 
                      fontSize: '12px', 
                      borderRadius: '16px', 
                      border: '1px solid var(--border)', 
                      background: 'var(--bg-card)',
                      color: 'var(--text)',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Uang Pas
                  </button>
                </div>
                <div className="flex-between" style={{ marginTop: '15px' }}>
                  <span>Kembalian</span> <strong className="text-green" style={{ fontSize: '18px' }}>{uangBayar.trim() === '' ? '-' : `Rp ${kembalian.toLocaleString('id-ID')}`}</strong>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
              <button className="btn bg-orange" style={{ flex: 1, padding: '15px', flexDirection: 'column', gap: '2px' }} onClick={simpanMejaUpdate}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                <span style={{ fontSize: '11px' }}>Simpan Meja</span>
              </button>
              <button className="btn bg-blue" style={{ flex: 2, padding: '15px', flexDirection: 'column', gap: '2px' }} onClick={checkout}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                <span style={{ fontSize: '11px' }}>Bayar Selesai</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

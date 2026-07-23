import React, { useState, useEffect, useRef } from 'react';
import { useStore } from './store';
import { formatTanggalIndo } from './utils/dateFormatter';
import { CheckCircle2, Check, Printer, ArrowLeft, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppModal } from './components/ModalContext';
import jsQR from 'jsqr';
import { QRCodeSVG } from 'qrcode.react';
import { btPrinter, formatReceipt } from './utils/bluetoothPrinter';

import TabKasir from './components/TabKasir';
import TabMeja from './components/TabMeja';
import TabStok from './components/TabStok';
import TabLaporan from './components/TabLaporan';
import TabMasterMenu from './components/TabMasterMenu';
import TabAsetOps from './components/TabAsetOps';

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('activeTab') || 'kasir';
  });
  const [activeSubTab, setActiveSubTab] = useState('sub-sistem');
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('pos_theme') || 'neutral');
  const [activePrintTx, setActivePrintTx] = useState<any | null>(null);
  const [activePrintReport, setActivePrintReport] = useState<any | null>(null);
  const { popup } = useAppModal();
  
  const [isSyncingBg, setIsSyncingBg] = useState(false);
  const [isPullingBg, setIsPullingBg] = useState(false);
  const [unsyncedState, setUnsyncedState] = useState(() => localStorage.getItem('pos_unsynced') === 'true');
  
  const { toko, setToko, menu, cart, stokData, transaksiList, hutangList, bebanAktif, keuangan, mejaAktif, stokHistory } = useStore();

  const isInitialMount = useRef(true);
  const isPullingRef = useRef(false);
  const isSyncingInProgress = useRef(false);
  const isPullingInProgress = useRef(false);



  useEffect(() => {
    // One-time cleanup for orphaned stok transactions & modalBahan
    let state = useStore.getState();
    let hasOrphanedTxs = false;
    let newTxList = state.transaksiList.filter(tx => {
      if (tx.tipe === 'Belanja Stok' && tx.stokId) {
        const exists = state.stokData.some(s => s.id === tx.stokId);
        if (!exists) {
           hasOrphanedTxs = true;
           return false;
        }
      }
      return true;
    });
    
    // Recalculate modalBahan completely based on current stokData and stokHistory
    let recalculatedModalBahan = 0;
    state.stokData.forEach(item => {
       const modalAwal = state.stokHistory.find(h => h.stokId === item.id && h.tipe === 'Modal Awal');
       if (modalAwal) {
          recalculatedModalBahan += (modalAwal.qty || 0) * (item.hargaPerUnit || 0);
       }
    });

    let recalculatedKeluarStok = 0;
    newTxList.forEach(tx => {
       if (tx.tipe === 'Belanja Stok') {
          recalculatedKeluarStok += (tx.total || 0);
       }
    });

    let newStokHistory = state.stokHistory.filter(h => state.stokData.some(s => s.id === h.stokId));
    let hasOrphanedHistory = newStokHistory.length !== state.stokHistory.length;

    if (hasOrphanedHistory || hasOrphanedTxs || state.keuangan.modalBahan !== recalculatedModalBahan || state.keuangan.keluarStok !== recalculatedKeluarStok) {
       console.log('Cleaning up orphaned state...');
       let newKeuangan = { ...state.keuangan, modalBahan: recalculatedModalBahan, keluarStok: recalculatedKeluarStok };
       useStore.getState().setFullState({ transaksiList: newTxList, keuangan: newKeuangan, stokHistory: newStokHistory });
       // We force a sync so this cleanup gets pushed to the cloud
       localStorage.setItem('pos_unsynced', 'true');
    }
  }, []);

  useEffect(() => {
    const handlePrint = (e: any) => {
      setActivePrintTx(e.detail);
    };
    window.addEventListener('print-receipt', handlePrint);
    return () => window.removeEventListener('print-receipt', handlePrint);
  }, []);

  useEffect(() => {
    const handlePrintReport = (e: any) => {
      setActivePrintReport(e.detail);
    };
    window.addEventListener('print-financial-report', handlePrintReport);
    return () => window.removeEventListener('print-financial-report', handlePrintReport);
  }, []);

  // Auto-print disabled in favor of manual selection (Bluetooth or Web/PDF)

  const handleShareReceipt = () => {
    if (!activePrintTx) return;

    const printItems = activePrintTx.items || [];
    const detailItems = printItems && printItems.length > 0 
      ? printItems.map((item: any) => `• ${item.name || item.nama} x${item.qty} (@Rp ${item.harga.toLocaleString('id-ID')}) -> Rp ${(item.qty * item.harga).toLocaleString('id-ID')}`).join('\n')
      : '';

    const shareText = `*${toko.nama || 'ERBEA COFFEE SPACE'}*
Struk Pembayaran Resmi
---------------------------------
Waktu: ${formatTanggalIndo(activePrintTx.tgl)}
Pelanggan: ${activePrintTx.ident || 'Umum'}
Status: ${activePrintTx.tipe || 'Penjualan'}
---------------------------------
${detailItems ? `${detailItems}\n---------------------------------` : ''}
Subtotal: Rp ${(activePrintTx.subtotal || activePrintTx.total).toLocaleString('id-ID')}
${activePrintTx.diskon > 0 ? `Diskon: -Rp ${activePrintTx.diskon.toLocaleString('id-ID')}\n` : ''}GRAND TOTAL: Rp ${activePrintTx.total.toLocaleString('id-ID')}
Pembayaran (${activePrintTx.metode || 'Cash'}): Rp ${(activePrintTx.bayar || activePrintTx.total).toLocaleString('id-ID')}
Kembalian: Rp ${((activePrintTx.bayar || activePrintTx.total) - activePrintTx.total) === 0 ? '-' : ((activePrintTx.bayar || activePrintTx.total) - activePrintTx.total).toLocaleString('id-ID')}
---------------------------------
Terima Kasih Atas Kunjungan Anda!
Silahkan Datang Kembali!`;

    const fallback = () => {
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
      window.open(url, '_blank');
    };

    if (navigator.share) {
      navigator.share({
        title: `Struk - ${activePrintTx.ident || 'Umum'}`,
        text: shareText
      }).catch((err) => {
        console.log('Error sharing:', err);
        fallback();
      });
    } else {
      fallback();
    }
  };

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].screenX;
    touchStartY.current = e.changedTouches[0].screenY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].screenX;
    touchEndY.current = e.changedTouches[0].screenY;
    handleSwipe();
  };

  const handleSwipe = () => {
    const tabs = ['kasir', 'meja', 'stok', 'laporan', 'mesin'];
    const currentIndex = tabs.indexOf(activeTab);
    const minSwipeDistance = 120; // Increased distance to require a longer swipe
    const maxVerticalDistance = 60; // Max allowed vertical movement to count as a horizontal swipe
    
    const xDistance = touchEndX.current - touchStartX.current;
    const yDistance = Math.abs(touchEndY.current - touchStartY.current);

    // Only proceed if it's mostly a horizontal swipe
    if (yDistance > maxVerticalDistance) return;

    // Swipe Left (Next tab) - Can also require starting from the right edge if needed, but long swipe is usually enough
    if (xDistance < -minSwipeDistance) {
      if (currentIndex < tabs.length - 1) setActiveTab(tabs[currentIndex + 1]);
    }
    // Swipe Right (Previous tab)
    if (xDistance > minSwipeDistance) {
      if (currentIndex > 0) setActiveTab(tabs[currentIndex - 1]);
    }
  };

  useEffect(() => {
    const handleNav = () => setActiveTab('kasir');
    window.addEventListener('navToKasir', handleNav);
    return () => window.removeEventListener('navToKasir', handleNav);
  }, []);

  const GAS_URL = "https://script.google.com/macros/s/AKfycbyVu5LE4XCwKk2mtSvwt5SlZ7xiwyIkBolzKKuiYMBswqsqVRfNPWG0WnZGQiMtcaYC/exec"; // TEMPEL URL WEB APP APPS SCRIPT ANDA DI SINI


  const isStaleUnsynced = () => {
    let isUnsynced = localStorage.getItem('pos_unsynced') === 'true';
    if (!isUnsynced) return false;
    
    const lastChange = parseInt(localStorage.getItem('pos_last_change_time') || '0', 10);
    if (lastChange === 0) return true;
    
    const hoursElapsed = (Date.now() - lastChange) / (1000 * 60 * 60);
    
    // Allow up to 72 hours of offline queue before discarding
    if (hoursElapsed > 72) {
      console.log('Unsynced data is too old ( > 72h). Discarding to prioritize cloud data.');
      localStorage.setItem('pos_unsynced', 'false');
      return false;
    }
    return true;
  };

  const syncToSheets = async (showPrompt = true) => {
    if (!navigator.onLine) {
      if (showPrompt) await popup('alert', 'Koneksi internet terputus. Data akan disimpan secara lokal dan disinkronkan nanti.', 'Offline');
      return;
    }
    if (!GAS_URL) {
      if (showPrompt) await popup('alert', 'URL Apps Script belum diatur di dalam kode sumber.', 'Gagal');
      return;
    }

    if (isSyncingInProgress.current) {
      console.log('Sync already in progress, skipping.');
      return;
    }
    isSyncingInProgress.current = true;

    try {
      if (showPrompt) setIsSaving(true);
      else setIsSyncingBg(true);
      
      const syncTime = localStorage.getItem('pos_last_change_time');
      let state = useStore.getState();

      const payload = {
        type: 'SYNC_ALL',
        payload: {
          toko: state.toko,
          menu: state.menu,
          stokData: state.stokData,
          bebanAktif: state.bebanAktif,
          keuangan: state.keuangan,
          transaksiList: state.transaksiList,
          hutangList: state.hutangList,
          stokHistory: state.stokHistory,
          mejaAktif: state.mejaAktif
        }
      };

      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        redirect: 'follow',
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      
      const text = await response.text();
      const contentType = response.headers.get("content-type");
      
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Apps Script tidak mengembalikan JSON. Cek deployment.");
      }

      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        throw new Error("Gagal parsing JSON dari Apps Script.");
      }

      if (result.status === 'success') {
        const currentTime = localStorage.getItem('pos_last_change_time');
        if (currentTime === syncTime || !currentTime) {
          localStorage.setItem('pos_unsynced', 'false');
          setUnsyncedState(false);
        } else {
          console.log('New local changes occurred during sync, keeping unsynced=true');
        }
        if (showPrompt) await popup('alert', 'Data berhasil disinkronkan dengan cloud!', 'Sukses');
      } else {
        throw new Error(result.message || 'Gagal menyimpan ke cloud');
      }
    } catch (error: any) {
      console.warn('Sync error:', error);
      let errMsg = error.message || String(error);
      if (errMsg === 'Failed to fetch' || errMsg.includes('NetworkError')) {
        errMsg = 'Gagal sinkronisasi ke Cloud (Failed to fetch). Data disimpan lokal. Pastikan URL Apps Script benar dan diset ke "Anyone".';
      }
      if (showPrompt) await popup('alert', errMsg, 'Error');
    } finally {
      if (showPrompt) setIsSaving(false);
      else setIsSyncingBg(false);
      isSyncingInProgress.current = false;
    }
  };

  const pullFromSheets = async (showPrompt = true) => {
    if (!navigator.onLine) {
      if (showPrompt) await popup('alert', 'Koneksi internet terputus. Tidak dapat menarik data terbaru.', 'Offline');
      return;
    }
    if (!GAS_URL) {
      if (showPrompt) await popup('alert', 'URL Apps Script belum diatur.', 'Gagal');
      return;
    }

    if (isPullingInProgress.current) return;
    isPullingInProgress.current = true;

    try {
      if (showPrompt) setIsSaving(true);
      else setIsPullingBg(true);

      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        redirect: 'follow',
        body: JSON.stringify({ type: 'PULL_ALL' })
      });
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      
      const text = await response.text();
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Apps Script tidak mengembalikan JSON.");
      }

      const result = JSON.parse(text);

      if (result.status === 'success' && result.data) {
        isPullingRef.current = true;
        
        useStore.getState().setFullState({
          toko: result.data.toko || { nama: '', logoBase64: null },
          menu: result.data.menu || [],
          stokData: result.data.stokData || [],
          bebanAktif: result.data.bebanAktif || { target: 0, perPorsi: 0, aset: [], ops: [] },
          keuangan: result.data.keuangan || { modalBahan: 0, modalOps: 0, masuk: 0, keluarStok: 0, keluarOp: 0, prive: 0, hppTerjual: 0 },
          transaksiList: result.data.transaksiList || [],
          hutangList: result.data.hutangList || [],
          stokHistory: result.data.stokHistory || [],
          mejaAktif: result.data.mejaAktif || []
        });

        localStorage.setItem('pos_unsynced', 'false');
        setUnsyncedState(false);

        if (showPrompt) await popup('alert', 'Data berhasil ditarik dari Cloud!', 'Sukses');

        setTimeout(() => { isPullingRef.current = false; }, 500);
      } else {
        throw new Error(result.message || 'Gagal menarik data');
      }
    } catch (error: any) {
      console.warn('Pull error:', error);
      let errMsg = error.message || String(error);
      if (errMsg === 'Failed to fetch' || errMsg.includes('NetworkError')) {
        errMsg = 'Gagal terhubung ke Cloud (Failed to fetch). Pastikan:\n1. URL Apps Script benar.\n2. Akses diset ke "Anyone".\n3. Koneksi internet stabil.';
      }
      if (showPrompt) await popup('alert', errMsg, 'Error');
    } finally {
      if (showPrompt) setIsSaving(false);
      else setIsPullingBg(false);
      isPullingInProgress.current = false;
    }
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('pos_theme') || 'neutral';
    document.body.classList.remove('dark-mode', 'neutral-mode');
    if (savedTheme === 'dark') document.body.classList.add('dark-mode');
    else if (savedTheme === 'neutral') document.body.classList.add('neutral-mode');
    
    const initSyncAndPull = async () => {
      if (GAS_URL) {
        if (navigator.onLine) {
          const isUnsynced = isStaleUnsynced();
          if (isUnsynced) {
            console.log('Unsynced local changes detected. Syncing to Google Sheets first...');
            await syncToSheets(false);
          }
          console.log('Pulling latest data from Google Sheets...');
          await pullFromSheets(false);
        } else {
          console.log('App is offline, using local cached data.');
        }
      }
    };
    initSyncAndPull();
  }, []);

  useEffect(() => {
    const handleOnline = async () => {
      if (GAS_URL) {
        const isUnsynced = isStaleUnsynced();
        if (isUnsynced) {
          popup('alert', 'Perangkat terhubung kembali ke internet! Mengirim antrean data offline ke Google Sheets...', 'Informasi');
          await syncToSheets(false);
          await pullFromSheets(false);
          popup('alert', 'Semua data offline berhasil disinkronkan ke Google Sheets!', 'Sukses');
        } else {
          await pullFromSheets(false);
        }
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Watcher: Auto-sync on local state changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    if (isPullingRef.current) {
      console.log('Watcher: State change ignored because it was triggered by pulling from cloud.');
      return;
    }
    
    const changeTimestamp = Date.now().toString();
    localStorage.setItem('pos_last_change_time', changeTimestamp);
    localStorage.setItem('pos_unsynced', 'true');
    setUnsyncedState(true);
    
    if (GAS_URL) {
      const timeout = setTimeout(async () => {
        if (navigator.onLine) {
          await syncToSheets(false);
        }
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [toko.qrisStatis, toko.nama, toko.logoBase64, menu, stokData, transaksiList, hutangList, bebanAktif, keuangan, mejaAktif, stokHistory]);

  // Watcher: Sync & Pull on Tab Switch / Tab Movement
  useEffect(() => {
    if (GAS_URL && navigator.onLine) {
      const isUnsynced = isStaleUnsynced();
      if (isUnsynced) {
        syncToSheets(false).then(() => pullFromSheets(false));
      } else {
        pullFromSheets(false);
      }
    }
  }, [activeTab]);

  // Watcher: Pull on window focus (multi-device synchronization support)
  useEffect(() => {
    const handleFocus = () => {
      if (GAS_URL && navigator.onLine) {
        const isUnsynced = isStaleUnsynced();
        if (isUnsynced) {
          syncToSheets(false).then(() => pullFromSheets(false));
        } else {
          pullFromSheets(false);
        }
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Watcher: Idle detection & interval background pull
  useEffect(() => {
    let idleTimer: NodeJS.Timeout;
    let pollInterval: NodeJS.Timeout;
    let lastPullTime = 0;

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      // Jika pengguna tidak melakukan apa-apa selama 1 detik, kita bersiap pull background (cooldown minimal 3 detik sekali)
      idleTimer = setTimeout(() => {
        const now = Date.now();
        if (GAS_URL && navigator.onLine && (now - lastPullTime > 3000)) {
          const isUnsynced = isStaleUnsynced();
          if (!isSaving && !isPullingBg && !isSyncingBg) {
            if (isUnsynced) {
              syncToSheets(false).then(() => pullFromSheets(false));
            } else {
              pullFromSheets(false);
            }
            lastPullTime = Date.now();
          }
        }
      }, 1000);
    };

    // Polling background berkala setiap 5 detik
    pollInterval = setInterval(() => {
      const isUnsynced = isStaleUnsynced();
      if (GAS_URL && navigator.onLine && !isSaving && !isPullingBg && !isSyncingBg) {
        if (isUnsynced) {
          syncToSheets(false).then(() => pullFromSheets(false));
        } else {
          pullFromSheets(false);
        }
        lastPullTime = Date.now();
      }
    }, 5000);

    // Activity listeners
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('click', resetIdleTimer);
    window.addEventListener('scroll', resetIdleTimer);
    window.addEventListener('touchstart', resetIdleTimer);

    resetIdleTimer();

    return () => {
      clearTimeout(idleTimer);
      clearInterval(pollInterval);
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('click', resetIdleTimer);
      window.removeEventListener('scroll', resetIdleTimer);
      window.removeEventListener('touchstart', resetIdleTimer);
    };
  }, [isSaving, isPullingBg, isSyncingBg]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 150;
        const MAX_HEIGHT = 150;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/png');
          setToko({ logoBase64: compressedBase64 });
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleQrisUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const resetInput = () => {
      e.target.value = '';
    };

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          
          let width = img.width;
          let height = img.height;
          const MAX_DIM = 1000;
          if (width > MAX_DIM || height > MAX_DIM) {
            const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            await popup('alert', "Gagal menginisialisasi canvas untuk membaca QR Code.", "Gagal");
            resetInput();
            return;
          }
          
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, width, height);
          
          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth",
          });
          
          if (code && code.data) {
            setToko({ qrisStatis: code.data });
            await popup('alert', `QRIS Statis berhasil dideteksi dan diekstrak!\n\nPayload: ${code.data}`, "Berhasil");
          } else {
            await popup('alert', "Gagal membaca QR Code dari gambar QRIS Statis. Pastikan gambar memiliki resolusi baik, tidak terpotong, atau coba unggah gambar yang lebih jelas.", "Gagal Membaca");
          }
          resetInput();
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      await popup('alert', "Terjadi kesalahan saat memproses gambar.", "Error");
      resetInput();
    }
  };

  const isPrinting = !!(activePrintTx || activePrintReport);

  return (
    <div 
      className={document.body?.className || ''} 
      onTouchStart={handleTouchStart} 
      onTouchEnd={handleTouchEnd}
      style={{ 
        minHeight: '100vh', 
        overflowX: 'hidden', 
        background: isPrinting ? '#f3f4f6' : 'var(--bg-color)',
        color: isPrinting ? '#1a202c' : 'var(--text-main)',
        transition: 'background 0.3s ease'
      }}
    >
      {!isPrinting && (
        <div id="main-app-content">
          {/* INDIKATOR SINKRONISASI CLOUD (TITIK KECIL BERWARNA SUTEL) */}
          <div style={{
            position: 'fixed',
            top: '12px',
            right: '12px',
            zIndex: 9999,
            width: '16px',
            height: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            userSelect: 'none'
          }}
          onClick={() => {
            if (navigator.onLine && !isSaving && !isSyncingBg && !isPullingBg) {
              pullFromSheets(true);
            }
          }}
          title={
            isSyncingBg || isSaving 
              ? "Sedang mengirim data terbaru ke Google Sheets..." 
              : isPullingBg 
                ? "Sedang menarik data terbaru dari Google Sheets..." 
                : unsyncedState 
                  ? "Ada perubahan lokal yang belum tersimpan ke Cloud. Klik untuk sinkronisasi paksa." 
                  : "Semua data tersimpan aman di Cloud! Klik untuk menarik ulang data terbaru."
          }
          >
            {/* Pulsing Outer Ring (Hanya jika sedang syncing/pulling atau ada pending save) */}
            {(isSyncingBg || isSaving || isPullingBg || unsyncedState) && (
              <motion.div
                style={{
                  position: 'absolute',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: isSyncingBg || isSaving 
                    ? 'rgba(59, 130, 246, 0.4)' 
                    : isPullingBg 
                      ? 'rgba(16, 185, 129, 0.4)' 
                      : 'rgba(245, 158, 11, 0.4)',
                  pointerEvents: 'none'
                }}
                animate={{
                  scale: [1, 1.8, 1],
                  opacity: [0.8, 0, 0.8]
                }}
                transition={{
                  repeat: Infinity,
                  duration: isSyncingBg || isSaving || isPullingBg ? 1.0 : 2.0,
                  ease: "easeInOut"
                }}
              />
            )}
            {/* Core Solid Dot */}
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isSyncingBg || isSaving 
                  ? '#3b82f6' // Blue for syncing
                  : isPullingBg 
                    ? '#10b981' // Green for pulling
                    : unsyncedState 
                      ? '#f59e0b' // Orange for unsynced
                      : '#10b981', // Solid Green for synchronized
                boxShadow: isSyncingBg || isSaving 
                  ? '0 0 6px #3b82f6' 
                  : isPullingBg 
                    ? '0 0 6px #10b981' 
                    : unsyncedState 
                      ? '0 0 6px #f59e0b' 
                      : 'none',
                transition: 'background-color 0.3s ease, box-shadow 0.3s ease'
              }}
            />
          </div>

        {isSaving && (
        <div className="modal-overlay active">
          <div className="clay-card modal-box" style={{ textAlign: 'center', margin: 'auto' }}>
            <h3 style={{ color: 'var(--text-main)', marginBottom: '10px' }}>Menyimpan Data...</h3>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
              <div className="spinner"></div>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Sinkronisasi dengan Google Workspace</p>
          </div>
        </div>
      )}



      {(activeTab === 'meja') && (
        <header>
          <div className="search-box">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--text-muted)" strokeWidth="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" placeholder="Cari..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </header>
      )}

      {/* TABS */}
      <section className={`container-tab ${activeTab === 'kasir' ? 'active' : ''}`}>
        <TabKasir />
      </section>
      
      <section className={`container-tab ${activeTab === 'meja' ? 'active' : ''}`}>
        <TabMeja searchQuery={searchQuery} />
      </section>
      
      <section className={`container-tab ${activeTab === 'stok' ? 'active' : ''}`}>
        <TabStok />
      </section>

      <section className={`container-tab ${activeTab === 'laporan' ? 'active' : ''}`}>
        <TabLaporan />
      </section>

      <section className={`container-tab ${activeTab === 'mesin' ? 'active' : ''}`}>
        <div className="clay-card">
          <div style={{ display: 'flex', gap: '10px', marginBottom: '25px' }}>
            <button className={`btn sub-tab-btn ${activeSubTab === 'sub-menu' ? 'active' : ''}`} onClick={() => setActiveSubTab('sub-menu')}>Master Menu</button>
            <button className={`btn sub-tab-btn ${activeSubTab === 'sub-aset' ? 'active' : ''}`} onClick={() => setActiveSubTab('sub-aset')}>Aset & Ops</button>
            <button className={`btn sub-tab-btn ${activeSubTab === 'sub-sistem' ? 'active' : ''}`} onClick={() => setActiveSubTab('sub-sistem')}>Toko & Sistem</button>
          </div>

          <div style={{ position: 'relative' }}>
            <AnimatePresence mode="wait">
              {activeSubTab === 'sub-sistem' && (
                <motion.div 
                  key="sub-sistem"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="sub-tab-content active"
                >
                  <h3 style={{ marginBottom: '15px', textAlign: 'center', color: 'var(--text-main)' }}>Pengaturan Identitas Toko</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div className="bg-dim" style={{ padding: '15px', borderRadius: '15px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Nama Toko</label>
                  <input 
                    type="text" 
                    className="btn-input" 
                    value={toko.nama} 
                    onChange={(e) => setToko({ nama: e.target.value })} 
                    placeholder="Masukkan Nama Toko" 
                    style={{ margin: 0, marginBottom: '15px', width: '100%' }}
                  />

                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Upload Logo Toko (Lokal)</label>
                  <div style={{display: 'flex', gap: '10px'}}>
                    <input type="file" accept="image/*" className="btn-input" style={{ fontSize: '12px', margin: 0, flex: 1 }} onChange={handleLogoUpload} />
                  </div>
                  
                  {toko.logoBase64 && (
                    <div style={{ textAlign: 'center', marginTop: '15px' }}>
                      <img 
                        src={toko.logoBase64} 
                        onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                        style={{ width: '80px', borderRadius: '10px', boxShadow: 'var(--clay-shadow-out)' }} 
                        alt="Logo" 
                      />
                    </div>
                  )}
                </div>

                <div className="bg-dim" style={{ padding: '15px', borderRadius: '15px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Integrasi QRIS Dinamis</label>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                    Unggah gambar QRIS Statis Anda (misal QRIS dari e-wallet/bank Anda). Aplikasi akan otomatis memindai QR Code untuk mengaktifkan fitur QRIS Dinamis otomatis di kasir.
                  </p>
                  
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                    <input type="file" accept="image/*" className="btn-input" style={{ fontSize: '12px', margin: 0, flex: 1 }} onChange={handleQrisUpload} />
                  </div>

                  <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Payload String QRIS Statis</label>
                  <textarea 
                    className="btn-input font-mono" 
                    value={toko.qrisStatis || ''} 
                    onChange={(e) => setToko({ qrisStatis: e.target.value })} 
                    placeholder="000201010211..." 
                    style={{ margin: 0, width: '100%', height: '80px', fontSize: '11px', resize: 'none' }}
                  />
                  <AnimatePresence>
                    {toko.qrisStatis && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.3 }}
                        style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                      >
                        <span style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '8px' }}>Pratinjau QRIS:</span>
                        <div style={{ padding: '10px', background: '#fff', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                          <QRCodeSVG value={toko.qrisStatis} size={150} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <hr style={{ border: 0, borderTop: '2px solid rgba(163,177,198,0.3)', margin: '25px 0' }} />
              
              <div className="flex-between" style={{ marginBottom: '15px' }}>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>Integrasi Google Sheets</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn bg-green" style={{ padding: '8px 12px', fontSize: '12px' }} onClick={() => pullFromSheets(true)}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg> Sinkronisasi
                  </button>
                </div>
              </div>

              <div className="flex-between">
                <span style={{ fontWeight: 600, fontSize: '14px' }}>Tampilan Tema</span>
                <button 
                  className="btn bg-blue" 
                  onClick={() => {
                    let nextTheme = 'neutral';
                    if (themeMode === 'neutral') nextTheme = 'light';
                    else if (themeMode === 'light') nextTheme = 'dark';
                    else if (themeMode === 'dark') nextTheme = 'neutral';
                    
                    document.body.classList.remove('dark-mode', 'neutral-mode');
                    if (nextTheme === 'dark') document.body.classList.add('dark-mode');
                    else if (nextTheme === 'neutral') document.body.classList.add('neutral-mode');
                    
                    localStorage.setItem('pos_theme', nextTheme);
                    setThemeMode(nextTheme);
                  }}
                >
                  Mode: {themeMode === 'dark' ? 'Gelap' : themeMode === 'light' ? 'Terang' : 'Netral'}
                </button>
              </div>
            </motion.div>
              )}
              
              {activeSubTab === 'sub-menu' && (
                <motion.div 
                  key="sub-menu"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="sub-tab-content active" 
                >
                  <TabMasterMenu />
                </motion.div>
              )}
              
              {activeSubTab === 'sub-aset' && (
                <motion.div 
                  key="sub-aset"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="sub-tab-content active"
                >
                  <TabAsetOps />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* BOTTOM NAV */}
      <nav className="bottom-nav">
        <button className={`nav-item ${activeTab === 'kasir' ? 'active' : ''}`} onClick={() => setActiveTab('kasir')}>
          <svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg> Kasir
        </button>
        <button className={`nav-item ${activeTab === 'meja' ? 'active' : ''}`} onClick={() => setActiveTab('meja')}>
          <svg viewBox="0 0 24 24"><path d="M4 18h16V6H4v12zm9-10h5v3h-5V8zm-7 0h5v5H6V8zm0 7h5v1h-5v-1zm7-2h5v3h-5v-3z"/></svg> Denah
        </button>
        <button className={`nav-item ${activeTab === 'stok' ? 'active' : ''}`} onClick={() => setActiveTab('stok')}>
          <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg> Stok
        </button>
        <button className={`nav-item ${activeTab === 'laporan' ? 'active' : ''}`} onClick={() => setActiveTab('laporan')}>
          <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg> Lap
        </button>
        <button className={`nav-item ${activeTab === 'mesin' ? 'active' : ''}`} onClick={() => setActiveTab('mesin')}>
          <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg> Master
        </button>
      </nav>
      </div>
      )}

      {isPrinting && (
        <div className="no-print" style={{ maxWidth: activePrintReport ? '850px' : '480px', margin: '20px auto 10px auto', display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px' }}>
          <button 
            className="btn" 
            onClick={() => {
              setActivePrintTx(null);
              setActivePrintReport(null);
            }} 
            style={{ 
              margin: 0, 
              padding: '10px 16px', 
              fontSize: '13px', 
              background: 'var(--clay-bg)', 
              color: 'var(--text-main)', 
              boxShadow: 'var(--clay-shadow-out)',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <ArrowLeft size={16} /> Tutup & Kembali
          </button>
          {activePrintTx && (
            <>
              <button 
                className="btn" 
                onClick={async () => {
                  try {
                    const text = formatReceipt(activePrintTx, toko);
                    if (!btPrinter.device || !btPrinter.characteristic) {
                      await btPrinter.connect();
                    }
                    await btPrinter.print(text);
                    alert("Struk berhasil dikirim ke printer bluetooth!");
                  } catch (err: any) {
                    let errMsg = err.message || String(err);
                    if (errMsg.includes("permissions policy") || errMsg.includes("disallowed")) {
                      alert("Gagal menghubungkan Bluetooth:\n\nBrowser memblokir akses Bluetooth di dalam frame preview. Silakan klik tombol 'Open in new tab' (Buka di tab baru) di kanan atas layar untuk menggunakan fitur printer bluetooth secara langsung.");
                    } else if (errMsg.includes("cancelled") || errMsg.includes("cancel") || errMsg.includes("chooser")) {
                      // Silently log or display a gentle notice for user cancellation
                      console.log("Pencarian printer bluetooth dibatalkan oleh pengguna.");
                    } else {
                      console.error("Bluetooth print error:", err);
                      alert("Gagal print bluetooth: " + errMsg);
                    }
                  }
                }} 
                style={{ 
                  margin: 0, 
                  padding: '10px 16px', 
                  fontSize: '13px', 
                  background: 'var(--green)', 
                  color: '#fff', 
                  boxShadow: 'var(--btn-shadow-out)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Printer size={16} /> Cetak Bluetooth
              </button>
              <button 
                className="btn" 
                onClick={handleShareReceipt} 
                style={{ 
                  margin: 0, 
                  padding: '10px 16px', 
                  fontSize: '13px', 
                  background: 'var(--clay-bg)', 
                  color: 'var(--text-main)', 
                  boxShadow: 'var(--clay-shadow-out)',
                  border: 'var(--clay-border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Share2 size={16} /> Share Struk
              </button>
            </>
          )}
          <button 
            className="btn" 
            onClick={() => {
              try {
                window.print();
              } catch (err) {
                console.error("Gagal mencetak:", err);
                alert("Pencetakan diblokir di sandbox iframe ini. Silakan buka aplikasi di tab baru (klik tombol 'Open in new tab' di kanan atas) atau gunakan tombol Share Struk.");
              }
            }} 
            style={{ 
              margin: 0, 
              padding: '10px 20px', 
              fontSize: '13px', 
              background: 'var(--clay-bg)', 
              color: 'var(--text-main)', 
              boxShadow: 'var(--clay-shadow-out)',
              border: 'var(--clay-border)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Printer size={16} /> Cetak / Simpan PDF
          </button>
        </div>
      )}

      {activePrintTx && (
        <div id="printArea" style={{ 
          width: '58mm', 
          padding: '10px 12px', 
          background: '#ffffff', 
          color: '#000000', 
          fontFamily: "'Courier New', Courier, monospace", 
          fontSize: '11px',
          lineHeight: '1.4'
        }}>
          {/* Header */}
          <div className="print-center" style={{ marginBottom: '10px' }}>
            {toko.logoBase64 ? (
              <img 
                src={toko.logoBase64} 
                className="print-logo" 
                onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                style={{ width: '45px', height: '45px', objectFit: 'contain', display: 'inline-block', marginBottom: '6px' }} 
              />
            ) : (
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>☕</div>
            )}
            <h3 style={{ margin: '0 0 2px 0', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {toko.nama || 'ERBEA COFFEE SPACE'}
            </h3>
            <div style={{ fontSize: '9px', color: '#333', textTransform: 'uppercase', marginBottom: '4px' }}>
              Struk Pembayaran Resmi
            </div>
            <div style={{ borderBottom: '1px double #000000', margin: '6px 0 8px 0' }}></div>
          </div>
          
          {/* Metadata */}
          <div style={{ fontSize: '10px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>WAKTU :</span>
              <span style={{ textAlign: 'right' }}>{formatTanggalIndo(activePrintTx.tgl)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>PELANGGAN:</span>
              <span style={{ textAlign: 'right', fontWeight: 'bold' }}>{activePrintTx.ident || 'Umum'}</span>
            </div>
            {activePrintTx.tipe && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>STATUS :</span>
                <span style={{ textAlign: 'right', textTransform: 'uppercase' }}>{activePrintTx.tipe}</span>
              </div>
            )}
          </div>

          <div style={{ borderBottom: '1px dashed #000000', margin: '8px 0' }}></div>
          
          {/* Column Header (Only if items exist) */}
          {activePrintTx.items && activePrintTx.items.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '10px', marginBottom: '6px', textTransform: 'uppercase' }}>
              <span>Menu / Produk</span>
              <span>Total (Rp)</span>
            </div>
          )}

          {/* Items List */}
          {activePrintTx.items && activePrintTx.items.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activePrintTx.items.map((item: any, idx: number) => (
                <div key={idx} style={{ fontSize: '11px' }}>
                  <div style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>
                    {item.name || item.nama}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '6px', fontSize: '10px', color: '#111' }}>
                    <span>
                      {item.qty} x {item.harga.toLocaleString('id-ID')}
                    </span>
                    <span>
                      {(item.qty * item.harga).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '10px 0', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>
              <div style={{ marginBottom: '4px' }}>{activePrintTx.tipe || 'Transaksi'}</div>
              <div style={{ fontSize: '9px', fontWeight: 'normal', textTransform: 'none', fontStyle: 'italic', color: '#666' }}>
                (Rincian pesanan tidak tersedia untuk data transaksi lama / log manual)
              </div>
            </div>
          )}
          
          <div style={{ borderBottom: '1px dashed #000000', margin: '8px 0' }}></div>
          
          {/* Totals & Payments */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal</span>
              <span>{(activePrintTx.subtotal || activePrintTx.total).toLocaleString('id-ID')}</span>
            </div>
            
            {activePrintTx.diskon > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Diskon</span>
                <span>- {activePrintTx.diskon.toLocaleString('id-ID')}</span>
              </div>
            )}
            
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              fontWeight: 'bold', 
              fontSize: '11px', 
              padding: '4px 0', 
              borderTop: '1px dashed #000000', 
              borderBottom: '1px dashed #000000', 
              margin: '3px 0' 
            }}>
              <span>GRAND TOTAL</span>
              <span>Rp {activePrintTx.total.toLocaleString('id-ID')}</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Pembayaran ({activePrintTx.metode || 'Cash'})</span>
              <span>{(activePrintTx.bayar || activePrintTx.total).toLocaleString('id-ID')}</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
              <span>Kembalian</span>
              <span>{((activePrintTx.bayar || activePrintTx.total) - activePrintTx.total) === 0 ? '-' : ((activePrintTx.bayar || activePrintTx.total) - activePrintTx.total).toLocaleString('id-ID')}</span>
            </div>
          </div>
          
          <div style={{ borderBottom: '1px double #000000', margin: '10px 0 8px 0' }}></div>
          
          {/* Footer Signature */}
          <div className="print-center" style={{ fontSize: '9px', marginTop: '6px', textTransform: 'uppercase', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontWeight: 'bold' }}>Terima Kasih Atas Kunjungan Anda</div>
            <div style={{ color: '#555' }}>Silahkan Datang Kembali!</div>
          </div>
        </div>
      )}

      {activePrintReport && (
        <div id="printReportArea" style={{ background: '#ffffff', color: '#3e2723', fontFamily: 'sans-serif', padding: '30px', minHeight: '100vh', boxSizing: 'border-box' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid #4e3629', paddingBottom: '15px', marginBottom: '25px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              {toko.logoBase64 && (
                <img 
                  src={toko.logoBase64} 
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                  style={{ width: '90px', height: '90px', objectFit: 'contain', borderRadius: '8px' }} 
                />
              )}
              <div>
                <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#4e3629', margin: 0, lineHeight: '1.2' }}>{toko.nama || 'Toko Kita'}</h1>
                <p style={{ fontSize: '13px', color: '#8d6e63', margin: '4px 0 0 0', fontWeight: '500' }}>Sistem Point of Sales & Keuangan Terintegrasi</p>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '25px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#3e2723', letterSpacing: '-0.5px', textTransform: 'uppercase', margin: 0 }}>LAPORAN ARUS KEUANGAN & LABA RUGI</h2>
            <p style={{ fontSize: '13px', color: '#8d6e63', marginTop: '6px', fontWeight: '500' }}>
              Periode: <span style={{ color: '#4e3629', fontWeight: 'bold' }}>{activePrintReport.filterMulai || 'Semua'}</span> s/d <span style={{ color: '#4e3629', fontWeight: 'bold' }}>{activePrintReport.filterAkhir || 'Semua'}</span>
            </p>
            <p style={{ fontSize: '11px', color: '#8d6e63', margin: '4px 0 0 0', fontStyle: 'italic' }}>
              Waktu Cetak: {new Date().toLocaleString('id-ID')}
            </p>
          </div>

          {/* Bento Grid Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px', marginBottom: '30px' }}>
            <div style={{ background: '#fdfbf7', border: '1px solid #d4b28c', borderRadius: '12px', padding: '15px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#5c3a21', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Total Pendapatan</span>
              <strong style={{ fontSize: '16px', color: '#4e3629' }}>Rp {activePrintReport.pemasukan.toLocaleString('id-ID')}</strong>
            </div>
            <div style={{ background: '#fcfaf7', border: '1px solid #e6ccb2', borderRadius: '12px', padding: '15px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#8d6e63', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Total Pengeluaran</span>
              <strong style={{ fontSize: '16px', color: '#7c2d12' }}>Rp {activePrintReport.pengeluaran.toLocaleString('id-ID')}</strong>
            </div>
            <div style={{ background: '#fcfaf7', border: '1px solid #e6ccb2', borderRadius: '12px', padding: '15px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#8d6e63', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Sisa Uang (Laci)</span>
              <strong style={{ fontSize: '16px', color: '#7c2d12' }}>Rp {(activePrintReport.laciPeriode || 0).toLocaleString('id-ID')}</strong>
            </div>
            <div style={{ background: '#fcfaf7', border: '1px solid #e6ccb2', borderRadius: '12px', padding: '15px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#8d6e63', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Penarikan Prive</span>
              <strong style={{ fontSize: '16px', color: '#7c2d12' }}>Rp {activePrintReport.prive.toLocaleString('id-ID')}</strong>
            </div>
            <div style={{ background: '#f5ebe6', border: '1px solid #c5a880', borderRadius: '12px', padding: '15px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#3e2723', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Laba Bersih (Net)</span>
              <strong style={{ fontSize: '16px', color: '#4e3629' }}>Rp {activePrintReport.labaBersih.toLocaleString('id-ID')}</strong>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginBottom: '30px' }}>
            {/* Left Column: Neraca Laba Rugi Komprehensif */}
            <div style={{ border: '1px solid #d7ccc8', borderRadius: '12px', padding: '18px', background: '#fdfbf7' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#4e3629', borderBottom: '2px solid #d7ccc8', paddingBottom: '8px', marginBottom: '12px', marginTop: 0, textTransform: 'uppercase' }}>Neraca Laba Rugi Komprehensif</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 0, fontSize: '12px' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #d7ccc8' }}>
                    <td style={{ padding: '8px 0', color: '#8d6e63' }}>Penjualan Kotor (Omset - Lunas & Kasbon)</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#3e2723' }}>Rp {activePrintReport.penjualan.toLocaleString('id-ID')}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #d7ccc8' }}>
                    <td style={{ padding: '8px 0', color: '#7c2d12' }}>(-) HPP (Modal Bahan Baku Terjual)</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: '500', color: '#7c2d12' }}>Rp {activePrintReport.hpp.toLocaleString('id-ID')}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #d7ccc8' }}>
                    <td style={{ padding: '8px 0', color: '#7c2d12' }}>(-) Pengeluaran Operasional (Beban)</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: '500', color: '#7c2d12' }}>Rp {activePrintReport.pengeluaranOps.toLocaleString('id-ID')}</td>
                  </tr>
                  <tr style={{ background: '#f5ebe6' }}>
                    <td style={{ padding: '10px 5px', fontWeight: 'bold', color: '#3e2723', fontSize: '13px' }}>LABA BERSIH (NET)</td>
                    <td style={{ padding: '10px 5px', textAlign: 'right', fontWeight: 'bold', color: '#3e2723', fontSize: '13px' }}>Rp {activePrintReport.labaBersih.toLocaleString('id-ID')}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Right Column: Status Keseluruhan Modal, ROI, & Kas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ border: '1px solid #d7ccc8', borderRadius: '12px', padding: '15px', background: '#fdfbf7' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#4e3629', borderBottom: '2px solid #d7ccc8', paddingBottom: '6px', marginBottom: '10px', marginTop: 0, textTransform: 'uppercase' }}>Status Modal & ROI</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                  <span style={{ color: '#8d6e63' }}>Modal Aset (Alat/Mesin):</span>
                  <span style={{ fontWeight: '600', color: '#3e2723' }}>Rp {activePrintReport.modalAset.toLocaleString('id-ID')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                  <span style={{ color: '#8d6e63' }}>Modal Bahan Baku:</span>
                  <span style={{ fontWeight: '600', color: '#3e2723' }}>Rp {activePrintReport.modalBahan.toLocaleString('id-ID')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderTop: '1px dashed #d7ccc8', paddingTop: '6px', marginBottom: '10px', fontWeight: 'bold' }}>
                  <span>Total Modal:</span>
                  <span style={{ color: '#c68642' }}>Rp {activePrintReport.totalModal.toLocaleString('id-ID')}</span>
                </div>
                <div style={{ background: '#f5ebe6', borderRadius: '8px', padding: '8px 12px', borderLeft: '4px solid #4e3629' }}>
                  <span style={{ fontSize: '10px', color: '#8d6e63', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>Balik Modal (ROI) Status</span>
                  <strong style={{ fontSize: '12px', color: activePrintReport.roi > 0 ? '#5c3a21' : activePrintReport.roi < 0 ? '#7c2d12' : '#8d6e63' }}>
                    {activePrintReport.roi > 0 ? `+Rp ${activePrintReport.roi.toLocaleString('id-ID')} (Untung Murni)` : activePrintReport.roi < 0 ? `-Rp ${Math.abs(activePrintReport.roi).toLocaleString('id-ID')} (Sisa Modal)` : 'Break Even Point'}
                  </strong>
                </div>
              </div>

              <div style={{ border: '1px solid #d7ccc8', borderRadius: '12px', padding: '15px', background: '#fdfbf7' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#4e3629', borderBottom: '2px solid #d7ccc8', paddingBottom: '6px', marginBottom: '10px', marginTop: 0, textTransform: 'uppercase' }}>Posisi Uang Kas & Laci</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '10px', color: '#8d6e63', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>Uang Laci Kas Sekarang</span>
                    <strong style={{ fontSize: '16px', color: '#3e2723' }}>Rp {activePrintReport.sisaKasLaci.toLocaleString('id-ID')}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Tables */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px', marginBottom: '30px' }}>
            {/* Hutang Aktif */}
            <div style={{ border: '1px solid #d7ccc8', borderRadius: '12px', padding: '15px', background: '#fdfbf7' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#7c2d12', borderBottom: '2px solid #e6ccb2', paddingBottom: '6px', marginBottom: '10px', marginTop: 0, textTransform: 'uppercase' }}>Kasbon Aktif ({activePrintReport.kasbonAktif.length})</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', margin: 0 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #d7ccc8', textAlign: 'left' }}>
                    <th style={{ padding: '6px 4px', color: '#8d6e63', fontSize: '10px' }}>Nama Pelanggan</th>
                    <th style={{ padding: '6px 4px', color: '#8d6e63', fontSize: '10px', textAlign: 'right' }}>Sisa Kasbon</th>
                  </tr>
                </thead>
                <tbody>
                  {activePrintReport.kasbonAktif.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ padding: '10px 4px', textAlign: 'center', color: '#8d6e63' }}>Tidak ada kasbon aktif</td>
                    </tr>
                  ) : (
                    activePrintReport.kasbonAktif.map((k: any, index: number) => (
                      <tr key={index} style={{ borderBottom: '1px solid #d7ccc8' }}>
                        <td style={{ padding: '6px 4px', fontWeight: '500', color: '#3e2723' }}>{k.nama}</td>
                        <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 'bold', color: '#7c2d12' }}>Rp {k.sisa.toLocaleString('id-ID')}</td>
                      </tr>
                    ))
                  )}
                  <tr style={{ background: '#fcfaf7', fontWeight: 'bold', borderTop: '2px solid #d7ccc8' }}>
                    <td style={{ padding: '6px 4px', color: '#3e2723' }}>Total Kasbon Aktif</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', color: '#7c2d12' }}>Rp {activePrintReport.totalKasbonAktif.toLocaleString('id-ID')}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Pelunasan Kasbon */}
            <div style={{ border: '1px solid #d7ccc8', borderRadius: '12px', padding: '15px', background: '#fdfbf7' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#5c3a21', borderBottom: '2px solid #c5a880', paddingBottom: '6px', marginBottom: '10px', marginTop: 0, textTransform: 'uppercase' }}>Pelunasan Kasbon Periode Ini</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', margin: 0 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #d7ccc8', textAlign: 'left' }}>
                    <th style={{ padding: '6px 4px', color: '#8d6e63', fontSize: '10px' }}>Tgl</th>
                    <th style={{ padding: '6px 4px', color: '#8d6e63', fontSize: '10px' }}>Nama</th>
                    <th style={{ padding: '6px 4px', color: '#8d6e63', fontSize: '10px', textAlign: 'right' }}>Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {activePrintReport.transaksi.filter((tx: any) => tx.tipe === 'Pelunasan Kasbon').length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ padding: '10px 4px', textAlign: 'center', color: '#8d6e63' }}>Tidak ada pelunasan kasbon</td>
                    </tr>
                  ) : (
                    activePrintReport.transaksi.filter((tx: any) => tx.tipe === 'Pelunasan Kasbon').map((tx: any, index: number) => (
                      <tr key={index} style={{ borderBottom: '1px solid #d7ccc8' }}>
                        <td style={{ padding: '6px 4px', color: '#8d6e63' }}>{formatTanggalIndo(tx.tgl)}</td>
                        <td style={{ padding: '6px 4px', fontWeight: '500', color: '#3e2723' }}>{tx.ident}</td>
                        <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 'bold', color: '#5c3a21' }}>Rp {tx.total.toLocaleString('id-ID')}</td>
                      </tr>
                    ))
                  )}
                  <tr style={{ background: '#f5ebe6', fontWeight: 'bold', borderTop: '2px solid #d7ccc8' }}>
                    <td colSpan={2} style={{ padding: '6px 4px', color: '#3e2723' }}>Total Pelunasan</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', color: '#3e2723' }}>
                      Rp {activePrintReport.transaksi.filter((tx: any) => tx.tipe === 'Pelunasan Kasbon').reduce((acc: number, tx: any) => acc + tx.total, 0).toLocaleString('id-ID')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Detailed Expenses, Purchases, Prives */}
          <div style={{ border: '1px solid #d7ccc8', borderRadius: '12px', padding: '15px', marginBottom: '40px', background: '#fdfbf7' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#7c2d12', borderBottom: '2px solid #e6ccb2', paddingBottom: '6px', marginBottom: '10px', marginTop: 0, textTransform: 'uppercase' }}>Rincian Pengeluaran, Belanja Stok & Prive</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', margin: 0 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #d7ccc8', textAlign: 'left' }}>
                  <th style={{ padding: '8px', color: '#8d6e63' }}>Tanggal</th>
                  <th style={{ padding: '8px', color: '#8d6e63' }}>Kategori</th>
                  <th style={{ padding: '8px', color: '#8d6e63' }}>Keterangan / Detail</th>
                  <th style={{ padding: '8px', color: '#8d6e63', textAlign: 'right' }}>Nominal</th>
                </tr>
              </thead>
              <tbody>
                {activePrintReport.transaksi.filter((tx: any) => ['Pengeluaran', 'Belanja Stok', 'Prive'].includes(tx.tipe)).length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '15px', textAlign: 'center', color: '#8d6e63' }}>Tidak ada data pengeluaran operasional / belanja stok / prive</td>
                  </tr>
                ) : (
                  activePrintReport.transaksi.filter((tx: any) => ['Pengeluaran', 'Belanja Stok', 'Prive'].includes(tx.tipe)).map((tx: any, index: number) => (
                    <tr key={index} style={{ borderBottom: '1px solid #d7ccc8' }}>
                      <td style={{ padding: '8px', color: '#8d6e63' }}>{formatTanggalIndo(tx.tgl)}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '9px',
                          fontWeight: 'bold',
                          color: tx.tipe === 'Prive' ? '#c68642' : '#7c2d12',
                          background: tx.tipe === 'Prive' ? '#fdfbf7' : '#fcfaf7',
                        }}>
                          {tx.tipe}
                        </span>
                      </td>
                      <td style={{ padding: '8px', fontWeight: '500', color: '#3e2723' }}>{tx.ident}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#7c2d12' }}>Rp {tx.total.toLocaleString('id-ID')}</td>
                    </tr>
                  ))
                )}
                <tr style={{ background: '#fcfaf7', fontWeight: 'bold', fontSize: '11px', borderTop: '2px solid #d7ccc8' }}>
                  <td colSpan={3} style={{ padding: '8px', color: '#3e2723' }}>Total Pengeluaran & Prive (Arus Kas Keluar)</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#7c2d12' }}>Rp {activePrintReport.pengeluaran.toLocaleString('id-ID')}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer Signature Area */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '50px', fontSize: '12px', textAlign: 'center', paddingRight: '50px' }}>
            <div>
              <p style={{ margin: '0 0 60px 0', color: '#8d6e63' }}>Dibuat Oleh,</p>
              <strong style={{ borderTop: '1px solid #d7ccc8', paddingTop: '5px', display: 'inline-block', width: '200px', color: '#3e2723' }}>Manajemen Toko</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

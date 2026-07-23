import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface StokItem {
  id: string;
  nama: string;
  sisa: number;
  unit: string;
  hargaPerUnit: number;
}

export interface MenuItem {
  id: string;
  name: string;
  harga: number;
  resep: any[];
  hppBahan?: number;
  hppOp?: number;
}

export interface CartItem extends MenuItem {
  qty: number;
  bayar: boolean;
}

export interface Meja {
  meja: string;
  namaIdentitas: string;
  items: CartItem[];
}

export interface TokoData {
  nama: string;
  alamat?: string;
  logoBase64: string | null;
  logoDriveId?: string;
  spreadsheetId?: string;
  gasUrl?: string;
  qrisStatis?: string;
  pinKasir?: string;
}

export interface HutangItem {
  id: number;
  nama: string;
  nominal: number;
  sisa: number;
  pembayaran: { tgl: string; jumlah: number }[];
  tglRaw: string;
}

interface PosState {
  menu: MenuItem[];
  cart: CartItem[];
  orderMode: string;
  toko: TokoData;
  stokData: StokItem[];
  stokHistory: any[];
  mejaAktif: Meja[];
  totalMeja: number;
  transaksiList: any[];
  hutangList: HutangItem[];
  keuangan: { masuk: number; keluarOp: number; keluarStok: number; prive: number; modalBahan: number; hppTerjual: number };
  bebanAktif: { aset: any[]; ops: any[]; target: number; perPorsi: number };
  tempResep: any[];
  
  setToko: (toko: Partial<TokoData>) => void;
  setMenu: (menu: MenuItem[]) => void;
  addToCart: (item: MenuItem) => void;
  updateCartQty: (idx: number, qty: number) => void;
  toggleCartBayar: (idx: number) => void;
  clearCart: () => void;
  setOrderMode: (mode: string) => void;
  
  setStokData: (stok: StokItem[]) => void;
  addStok: (item: StokItem) => void;
  updateStok: (idx: number, item: Partial<StokItem>) => void;
  deleteStok: (idx: number) => void;
  addStokHistory: (history: any) => void;

  setMejaAktif: (meja: Meja[]) => void;
  setTotalMeja: (total: number) => void;
  setCart: (cart: CartItem[]) => void;
  
  addTransaksi: (tx: any) => void;
  deleteTransaksi: (txIndex: number) => void;
  addHutang: (hutang: HutangItem) => void;
  updateHutang: (hutangList: HutangItem[]) => void;
  
  updateKeuangan: (k: Partial<PosState['keuangan']>) => void;
  updateBebanAktif: (b: Partial<PosState['bebanAktif']>) => void;
  
  setTempResep: (resep: any[]) => void;
  
  setFullState: (state: Partial<PosState>) => void;
  resetStore: () => void;
}

const initialState = {
  menu: [],
  cart: [],
  orderMode: 'Takeaway',
  toko: { nama: '', logoBase64: null },
  stokData: [],
  stokHistory: [],
  mejaAktif: [],
  totalMeja: 8,
  transaksiList: [],
  hutangList: [],
  keuangan: { masuk: 0, keluarOp: 0, keluarStok: 0, prive: 0, modalBahan: 0, hppTerjual: 0 },
  bebanAktif: { aset: [], ops: [], target: 1000, perPorsi: 0 },
  tempResep: [],
  
};

export const useStore = create<PosState>()(
  persist(
    (set) => ({
      ...initialState,
      
      setToko: (t) => set((state) => ({ toko: { ...state.toko, ...t } })),
      setMenu: (menu) => set({ menu }),
      setOrderMode: (orderMode) => set({ orderMode }),
      setCart: (cart) => set({ cart }),
      addToCart: (item) => set((state) => {
        const exist = state.cart.findIndex(c => c.id === item.id);
        if (exist >= 0) {
          const newCart = [...state.cart];
          newCart[exist].qty++;
          return { cart: newCart };
        }
        return { cart: [...state.cart, { ...item, qty: 1, bayar: true }] };
      }),
      updateCartQty: (idx, val) => set((state) => {
        const newCart = [...state.cart];
        newCart[idx].qty += val;
        if (newCart[idx].qty <= 0) newCart.splice(idx, 1);
        return { cart: newCart };
      }),
      toggleCartBayar: (idx) => set((state) => {
        const newCart = [...state.cart];
        newCart[idx].bayar = !newCart[idx].bayar;
        return { cart: newCart };
      }),
      clearCart: () => set({ cart: [] }),
      
      setStokData: (stokData) => set({ stokData }),
      addStok: (item) => set((state) => ({ stokData: [...state.stokData, item] })),
      updateStok: (idx, item) => set((state) => {
        const newStok = [...state.stokData];
        newStok[idx] = { ...newStok[idx], ...item };
        return { stokData: newStok };
      }),
      deleteStok: (idx) => set((state) => {
        const itemToDelete = state.stokData[idx];
        const newStok = [...state.stokData];
        newStok.splice(idx, 1);
        if (!itemToDelete) return { stokData: newStok };
        
        let newKeuangan = { ...state.keuangan };
        let newTransaksiList = [...state.transaksiList];
        
        const modalAwalHistory = state.stokHistory.find(h => h.stokId === itemToDelete.id && h.tipe === 'Modal Awal');
        if (modalAwalHistory) {
          const originalModal = (modalAwalHistory.qty || 0) * (itemToDelete.hargaPerUnit || 0);
          newKeuangan.modalBahan = Math.max(0, newKeuangan.modalBahan - originalModal);
        }

        const belanjaStokTxs = state.transaksiList.filter(tx => tx.tipe === 'Belanja Stok' && tx.stokId === itemToDelete.id);
        const sumBelanjaStok = belanjaStokTxs.reduce((acc, tx) => acc + (tx.total || 0), 0);
        newKeuangan.keluarStok = Math.max(0, newKeuangan.keluarStok - sumBelanjaStok);
        
        newTransaksiList = newTransaksiList.filter(tx => !(tx.tipe === 'Belanja Stok' && tx.stokId === itemToDelete.id));

        const newHistory = state.stokHistory.filter(h => h.stokId !== itemToDelete.id);
        
        return { 
          stokData: newStok, 
          stokHistory: newHistory,
          keuangan: newKeuangan,
          transaksiList: newTransaksiList
        };
      }),
      addStokHistory: (history) => set((state) => ({ stokHistory: [...state.stokHistory, history] })),
      
      setMejaAktif: (mejaAktif) => set({ mejaAktif }),
      setTotalMeja: (totalMeja) => set({ totalMeja }),
      
      addTransaksi: (tx) => set((state) => ({ transaksiList: [...state.transaksiList, tx] })),
      deleteTransaksi: (txIndex) => set((state) => {
        const tx = state.transaksiList[txIndex];
        if (!tx) return state;
        
        let newKeuangan = { ...state.keuangan };
        let newHutangList = [...state.hutangList];
        let newStokData = [...state.stokData];
        
        if (tx.tipe === 'Penjualan') {
          newKeuangan.masuk -= tx.total;
        } else if (tx.tipe === 'Kasbon') {
          const hutangIdx = newHutangList.findIndex(h => h.id === tx.id || h.id === tx.hutangId || (h.nama === tx.ident && h.nominal === tx.total));
          if (hutangIdx >= 0) newHutangList.splice(hutangIdx, 1);
        } else if (tx.tipe === 'Pelunasan Kasbon') {
          newKeuangan.masuk -= tx.total;
          const hutangIdx = newHutangList.findIndex(h => h.id === tx.hutangId || h.nama === tx.ident);
          if (hutangIdx >= 0) {
            const h = newHutangList[hutangIdx];
            newHutangList[hutangIdx] = {
              ...h,
              sisa: h.sisa + tx.total,
              pembayaran: h.pembayaran.filter(p => p.jumlah !== tx.total)
            };
          } else {
            newHutangList.push({
              id: tx.hutangId || Date.now(),
              nama: tx.ident,
              nominal: tx.total,
              sisa: tx.total,
              pembayaran: [],
              tglRaw: tx.tglRaw || new Date().toISOString().split('T')[0]
            });
          }
        } else if (tx.tipe === 'Pengeluaran') {
          newKeuangan.keluarOp -= tx.total;
        } else if (tx.tipe === 'Prive') {
          newKeuangan.prive -= tx.total;
        } else if (tx.tipe === 'Belanja Stok') {
          newKeuangan.keluarStok -= tx.total;
          if (tx.stokId) {
            const stokIdx = newStokData.findIndex(s => s.id === tx.stokId);
            if (stokIdx >= 0) {
              newStokData[stokIdx] = {
                ...newStokData[stokIdx],
                sisa: Math.max(0, newStokData[stokIdx].sisa - (tx.stokQty || 0))
              };
            }
          }
        }

        if (tx.tipe === 'Penjualan' || tx.tipe === 'Kasbon') {
          // Revert stok bahan baku based on exact history
          const historyToReverse = state.stokHistory.filter(h => h.txId == tx.id);
          historyToReverse.forEach(h => {
             const stokIdx = newStokData.findIndex(s => s.id === h.stokId);
             if (stokIdx >= 0) {
                newStokData[stokIdx] = {
                  ...newStokData[stokIdx],
                  sisa: newStokData[stokIdx].sisa + h.qty
                };
             }
          });
          
          if (tx.hppTotal) {
            newKeuangan.hppTerjual = Math.max(0, newKeuangan.hppTerjual - tx.hppTotal);
          } else if (tx.items && tx.items.length > 0) {
            tx.items.forEach((cartItem: any) => {
              const masterMenu = state.menu.find(m => m.id === cartItem.id);
              if (masterMenu) {
                if (masterMenu.hppBahan && (!masterMenu.resep || masterMenu.resep.length === 0)) {
                  newKeuangan.hppTerjual = Math.max(0, newKeuangan.hppTerjual - (masterMenu.hppBahan * cartItem.qty));
                } else if (masterMenu.resep && masterMenu.resep.length > 0) {
                  masterMenu.resep.forEach((r: any) => {
                    const currentPrice = r.hargaPerUnit;
                    newKeuangan.hppTerjual = Math.max(0, newKeuangan.hppTerjual - (currentPrice * r.qty * cartItem.qty));
                  });
                }
              }
            });
          }
        }
        
        const newTransaksiList = [...state.transaksiList];
        newTransaksiList.splice(txIndex, 1);
        
        let newStokHistory = [...state.stokHistory];
        if (tx.id) {
          newStokHistory = newStokHistory.filter(h => h.txId != tx.id);
        }
        
        return {
          transaksiList: newTransaksiList,
          keuangan: newKeuangan,
          hutangList: newHutangList,
          stokData: newStokData,
          stokHistory: newStokHistory
        };
      }),
      addHutang: (hutang) => set((state) => ({ hutangList: [...state.hutangList, hutang] })),
      updateHutang: (hutangList) => set({ hutangList }),
      
      updateKeuangan: (k) => set((state) => ({ keuangan: { ...state.keuangan, ...k } })),
      updateBebanAktif: (b) => set((state) => ({ bebanAktif: { ...state.bebanAktif, ...b } })),
      
      setTempResep: (tempResep) => set({ tempResep }),
      
      setFullState: (newState) => set((state) => ({ ...state, ...newState })),
      resetStore: () => set(initialState),
    }),
    {
      name: 'pos-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

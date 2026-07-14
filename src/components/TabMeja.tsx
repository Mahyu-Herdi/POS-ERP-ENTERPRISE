import React, { useState } from 'react';
import { useStore } from '../store';

export default function TabMeja({ searchQuery = '' }: { searchQuery?: string }) {
  const { totalMeja, mejaAktif, setTotalMeja, setOrderMode, setMejaAktif } = useStore();

  const loadMejaToCart = (mejaName: string) => {
    // We need to set active tab to 'kasir' from the parent, but we can do it by passing a prop or using a custom event/state.
    // For now, let's assume we dispatch an event or the parent passes a function.
    window.dispatchEvent(new CustomEvent('navToKasir'));
    
    setOrderMode('Dine-In');
    const md = mejaAktif.find(m => m.meja === mejaName);
    
    window.dispatchEvent(new CustomEvent('setIdentifier', { detail: md ? md.namaIdentitas : (mejaName + " - ") }));
    useStore.getState().setCart(md ? JSON.parse(JSON.stringify(md.items)) : []);
  };

  return (
    <div className="clay-card">
      <div className="flex-between">
        <h3 style={{ color: 'var(--text-muted)' }}>Status Denah Meja</h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn bg-red" style={{ padding: '6px 12px' }} onClick={() => setTotalMeja(Math.max(1, totalMeja - 1))}>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <button className="btn bg-green" style={{ padding: '6px 12px' }} onClick={() => setTotalMeja(totalMeja + 1)}>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        </div>
      </div>
      
      <div className="grid-view" style={{ marginTop: '15px' }}>
        {Array.from({ length: totalMeja }).map((_, i) => {
          const num = i + 1;
          const tName = `Meja ${num < 10 ? '0' : ''}${num}`;
          const md = mejaAktif.find(m => m.meja === tName);
          
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matchName = tName.toLowerCase().includes(q);
            const matchIdent = md && md.namaIdentitas && md.namaIdentitas.toLowerCase().includes(q);
            if (!matchName && !matchIdent) {
              return null;
            }
          }

          const color = md ? 'var(--red)' : 'var(--text-muted)';
          
          return (
            <div key={tName} className="btn" style={{ flexDirection: 'column', gap: '2px' }} onClick={() => loadMejaToCart(tName)}>
              <svg viewBox="0 0 100 60" width="45" style={{ marginBottom: '5px' }}>
                <rect x="20" y="15" width="60" height="30" rx="8" fill={color}/>
                <circle cx="10" cy="30" r="8" fill="var(--blue)"/>
                <circle cx="90" cy="30" r="8" fill="var(--blue)"/>
              </svg>
              <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{tName}</div>
              {md ? (
                <>
                  <div className="text-red" style={{ fontSize: '11px', marginTop: '4px', fontWeight: 700 }}>Dine-In ({md.items.length} Item)</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-main)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{md.namaIdentitas.replace(tName + ' - ', '') || md.namaIdentitas}</div>
                </>
              ) : (
                <div className="text-green" style={{ fontSize: '11px', marginTop: '8px', fontWeight: 700 }}>Kosong</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

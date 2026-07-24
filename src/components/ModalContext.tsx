import React, { createContext, useState, useContext, ReactNode } from 'react';

type ModalType = 'alert' | 'confirm' | 'prompt_text' | 'prompt_num' | 'prompt_float' | 'print_confirm' | 'receipt_detail';

interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  msg: string;
  resolve: (value: any) => void;
  data?: any;
}

interface ModalContextProps {
  popup: (type: ModalType, msg: string, title?: string, data?: any) => Promise<any>;
}

const ModalContext = createContext<ModalContextProps | undefined>(undefined);

export const useAppModal = () => {
  const context = useContext(ModalContext);
  if (!context) throw new Error("useAppModal must be used within ModalProvider");
  return context;
};

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: 'alert',
    title: '',
    msg: '',
    resolve: () => {},
  });
  const [inputValue, setInputValue] = useState('');

  const popup = (type: ModalType, msg: string, title = 'Informasi', data?: any) => {
    return new Promise<any>((resolve) => {
      setInputValue('');
      setModal({ isOpen: true, type, title, msg, resolve, data });
    });
  };

  const handleClose = (value: any) => {
    modal.resolve(value);
    setModal({ ...modal, isOpen: false });
  };

  const parseAngka = (str: string) => {
    return parseInt(String(str).replace(/\D/g, ''), 10) || 0;
  };

  const parseFloatCustom = (str: string) => {
    return parseFloat(String(str).replace(/[^0-9.]/g, '')) || 0;
  };

  const formatUang = (val: string) => {
    let clean = String(val).replace(/\D/g, '');
    if (clean === '') return '';
    return parseInt(clean, 10).toLocaleString('id-ID');
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (modal.type === 'prompt_num') {
      setInputValue(formatUang(e.target.value));
    } else if (modal.type === 'prompt_float') {
      setInputValue(e.target.value.replace(/[^0-9.]/g, ''));
    } else {
      setInputValue(e.target.value);
    }
  };

  const handleConfirm = () => {
    if (modal.type === 'prompt_num') {
      handleClose(parseAngka(inputValue));
    } else if (modal.type === 'prompt_float') {
      handleClose(parseFloatCustom(inputValue));
    } else if (modal.type === 'prompt_text') {
      handleClose(inputValue.trim());
    } else {
      handleClose(true);
    }
  };

  return (
    <ModalContext.Provider value={{ popup }}>
      {children}
      <div className={`modal-overlay ${modal.isOpen ? 'active' : ''}`} id="clayModal">
        <div className="clay-card modal-box" style={{ textAlign: 'center', margin: 'auto' }}>
          <h3 style={{ color: 'var(--text-main)', marginBottom: '10px' }}>{modal.title}</h3>
          
          {modal.type === 'receipt_detail' ? (
            <p style={{ 
              color: 'var(--text-main)', 
              fontSize: '13px', 
              lineHeight: '1.5', 
              marginBottom: '20px',
              whiteSpace: 'pre-line',
              textAlign: 'left',
              fontFamily: "'Courier New', Courier, monospace",
              background: 'rgba(0,0,0,0.04)',
              padding: '14px',
              borderRadius: '16px',
              maxHeight: '320px',
              overflowY: 'auto',
              border: '1px dashed var(--text-muted)'
            }}>
              {modal.msg}
            </p>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.5', marginBottom: '20px', whiteSpace: 'pre-line', maxHeight: '320px', overflowY: 'auto', textAlign: 'left', padding: '10px', background: 'rgba(0,0,0,0.02)', borderRadius: '12px' }}>
              {modal.msg}
            </p>
          )}
          
          {(modal.type === 'prompt_text' || modal.type === 'prompt_num' || modal.type === 'prompt_float') && (
            <input
              type="text"
              inputMode={modal.type === 'prompt_num' || modal.type === 'prompt_float' ? 'decimal' : 'text'}
              className="btn-input"
              style={{ textAlign: 'center', fontSize: '18px', display: 'block' }}
              placeholder={modal.type === 'prompt_num' ? 'Ketik nominal angka...' : modal.type === 'prompt_float' ? 'Ketik angka...' : 'Ketik di sini...'}
              value={inputValue}
              onChange={handleInput}
              autoFocus
            />
          )}

          <div style={{ display: 'flex', gap: '15px', marginTop: '25px' }}>
            {(modal.type === 'confirm' || modal.type === 'print_confirm' || modal.type === 'prompt_text' || modal.type === 'prompt_num' || modal.type === 'prompt_float' || modal.type === 'receipt_detail') && (
              <button
                className="btn bg-red"
                style={{ flex: 1, display: 'block' }}
                onClick={() => handleClose(false)}
              >
                {modal.type === 'print_confirm' ? 'Tidak Perlu' : 'Tutup'}
              </button>
            )}
            
            {modal.type === 'receipt_detail' && (
              <button
                className="btn"
                style={{ flex: 1, backgroundColor: '#25D366' }}
                onClick={() => handleClose('share')}
              >
                Share
              </button>
            )}

            <button
              className="btn bg-blue"
              style={{ flex: 1 }}
              onClick={() => {
                if (modal.type === 'receipt_detail') {
                  handleClose('print');
                } else {
                  handleConfirm();
                }
              }}
            >
              {modal.type === 'alert' ? 'Tutup' : modal.type === 'print_confirm' ? 'Print Struk' : modal.type === 'receipt_detail' ? 'Print Struk' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    </ModalContext.Provider>
  );
};

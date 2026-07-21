import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function CustomDatePicker({ value, onChange, placeholder = "Pilih tanggal", className, style }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(value ? new Date(value) : new Date());
  
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectDate = (day: number) => {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const handleToday = () => {
    const d = new Date();
    setCurrentDate(d);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setIsOpen(false);
  };

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay(); // 0 is Sunday

  const renderDays = () => {
    const days = [];
    const today = new Date();
    
    let selectedDateObj: Date | null = null;
    if (value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        selectedDateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
    }

    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} style={{ padding: '8px' }}></div>);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = today.getDate() === d && today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();
      const isSelected = selectedDateObj && selectedDateObj.getDate() === d && selectedDateObj.getMonth() === currentDate.getMonth() && selectedDateObj.getFullYear() === currentDate.getFullYear();
      
      days.push(
        <button 
          key={d} 
          onClick={(e) => { e.preventDefault(); handleSelectDate(d); }}
          style={{
            background: isSelected ? 'var(--blue)' : isToday ? 'var(--input-bg)' : 'transparent',
            color: isSelected ? '#fff' : 'var(--text-main)',
            borderRadius: '8px',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: 'auto',
            border: isToday && !isSelected ? '1px solid var(--blue)' : 'none',
            cursor: 'pointer',
            fontSize: '14px'
          }}
          className="hover:opacity-80"
        >
          {d}
        </button>
      );
    }
    return days;
  };

  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  let displayValue = value;
  if (value) {
    const parts = value.split('-');
    if (parts.length === 3) {
      displayValue = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: style?.flex || 'unset', margin: style?.margin || 0 }}>
      <div 
        className={className}
        style={{ ...style, display: 'flex', alignItems: 'center', cursor: 'pointer', justifyContent: 'space-between', userSelect: 'none' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ color: value ? 'var(--text-main)' : 'var(--text-muted)' }}>
          {displayValue || placeholder}
        </span>
        <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: '8px',
          zIndex: 50,
          background: 'var(--clay-bg)',
          borderRadius: '12px',
          padding: '16px',
          boxShadow: 'var(--clay-shadow-out)',
          width: '280px',
          color: 'var(--text-main)'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <button 
              onClick={(e) => { e.preventDefault(); setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)); }} 
              style={{ padding: '4px', cursor: 'pointer', background: 'var(--sub-card-bg)', borderRadius: '6px', border: 'none', color: 'var(--text-main)' }}
              className="hover:opacity-80"
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</span>
            <button 
              onClick={(e) => { e.preventDefault(); setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)); }} 
              style={{ padding: '4px', cursor: 'pointer', background: 'var(--sub-card-bg)', borderRadius: '6px', border: 'none', color: 'var(--text-main)' }}
              className="hover:opacity-80"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day Names */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
            {dayNames.map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'bold' }}>{d}</div>
            ))}
          </div>

          {/* Days */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '16px' }}>
            {renderDays()}
          </div>

          {/* Footer Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--sub-card-bg)', paddingTop: '12px' }}>
            <button 
              onClick={(e) => { e.preventDefault(); handleClear(); }}
              style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'transparent', padding: '6px 12px', cursor: 'pointer', border: 'none' }}
              className="hover:text-white"
            >
              Reset
            </button>
            <button 
              onClick={(e) => { e.preventDefault(); handleToday(); }}
              style={{ fontSize: '12px', color: 'var(--blue)', fontWeight: 'bold', background: 'transparent', padding: '6px 12px', cursor: 'pointer', border: 'none' }}
              className="hover:opacity-80"
            >
              Hari Ini
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

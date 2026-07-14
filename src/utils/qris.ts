/**
 * Helper functions for QRIS (EMVCo) parsing and dynamic generation
 */

/**
 * Calculates CRC-16/CCITT-FALSE for QRIS (Polynomial: 0x1021, Init: 0xFFFF)
 */
export function calcCRC16(str: string): string {
  let crc = 0xFFFF;
  for (let c = 0; c < str.length; c++) {
    const code = str.charCodeAt(c);
    crc ^= (code << 8);
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Converts a Static QRIS payload to a Dynamic QRIS payload with the specified amount and optional items summary
 * 
 * Rules:
 * 1. Change tag 01 (Point of Initiation Method) from '11' to '12'
 * 2. Add or update tag 54 (Transaction Amount) with the formatted amount
 * 3. Add or update tag 62 (Additional Data Field Template) with sub-tag 05 (Reference Label) containing the items summary
 * 4. Recalculate CRC16 (tag 63)
 */
export function generateDynamicQRIS(staticQris: string, amount: number, itemsSummary?: string): string {
  if (!staticQris) return '';
  
  // Clean up input
  let cleanQris = staticQris.trim();
  
  // Remove existing CRC16 tag 63 from the end if present
  if (cleanQris.endsWith('6304')) {
    cleanQris = cleanQris.substring(0, cleanQris.length - 4);
  } else if (/6304[0-9A-Fa-f]{4}$/.test(cleanQris)) {
    cleanQris = cleanQris.substring(0, cleanQris.length - 8);
  }
  
  const fields: { tag: string; value: string }[] = [];
  let i = 0;
  
  // Parse TLV structure
  while (i < cleanQris.length) {
    if (i + 4 > cleanQris.length) {
      break;
    }
    const tag = cleanQris.substring(i, i + 2);
    const lenStr = cleanQris.substring(i + 2, i + 4);
    const len = parseInt(lenStr, 10);
    
    if (isNaN(len) || i + 4 + len > cleanQris.length) {
      break;
    }
    
    const value = cleanQris.substring(i + 4, i + 4 + len);
    fields.push({ tag, value });
    i += 4 + len;
  }
  
  if (fields.length === 0) {
    // Fallback if parsing fails (unlikely for a real QRIS, but let's be safe)
    return staticQris;
  }
  
  // 1. Point of Initiation Method (tag 01) must be "12" (dynamic)
  let tag01Found = false;
  for (const f of fields) {
    if (f.tag === '01') {
      f.value = '12';
      tag01Found = true;
      break;
    }
  }
  if (!tag01Found) {
    const idx00 = fields.findIndex(f => f.tag === '00');
    if (idx00 >= 0) {
      fields.splice(idx00 + 1, 0, { tag: '01', value: '12' });
    } else {
      fields.unshift({ tag: '01', value: '12' });
    }
  }
  
  // 2. Transaction Amount (tag 54)
  const amountStr = Math.round(amount).toString();
  let tag54Found = false;
  for (const f of fields) {
    if (f.tag === '54') {
      f.value = amountStr;
      tag54Found = true;
      break;
    }
  }
  if (!tag54Found) {
    // Insert tag 54 in the correct numerical order
    let insertIdx = fields.findIndex(f => parseInt(f.tag, 10) > 54);
    if (insertIdx === -1) {
      insertIdx = fields.length;
    }
    fields.splice(insertIdx, 0, { tag: '54', value: amountStr });
  }

  // 3. Additional Data Template (tag 62)
  if (itemsSummary) {
    // Clean summary (remove non-alphanumeric chars to be safe, keeping spaces, commas, and x)
    const cleanSummary = itemsSummary.replace(/[^a-zA-Z0-9\s,x\-]/g, '').substring(0, 25).trim();
    
    if (cleanSummary.length > 0) {
      const sub05 = '05' + cleanSummary.length.toString().padStart(2, '0') + cleanSummary;
      
      let tag62Found = false;
      for (const f of fields) {
        if (f.tag === '62') {
          let subQris = f.value;
          const subFields: { tag: string; value: string }[] = [];
          let j = 0;
          while (j < subQris.length) {
            if (j + 4 > subQris.length) break;
            const subTag = subQris.substring(j, j + 2);
            const subLenStr = subQris.substring(j + 2, j + 4);
            const subLen = parseInt(subLenStr, 10);
            if (isNaN(subLen) || j + 4 + subLen > subQris.length) break;
            const subVal = subQris.substring(j + 4, j + 4 + subLen);
            subFields.push({ tag: subTag, value: subVal });
            j += 4 + subLen;
          }
          
          let sub05Found = false;
          for (const sf of subFields) {
            if (sf.tag === '05') {
              sf.value = cleanSummary;
              sub05Found = true;
              break;
            }
          }
          if (!sub05Found) {
            subFields.push({ tag: '05', value: cleanSummary });
          }
          
          let new62Val = '';
          for (const sf of subFields) {
            new62Val += sf.tag + sf.value.length.toString().padStart(2, '0') + sf.value;
          }
          f.value = new62Val;
          tag62Found = true;
          break;
        }
      }
      
      if (!tag62Found) {
        let insertIdx = fields.findIndex(f => parseInt(f.tag, 10) > 62);
        if (insertIdx === -1) {
          insertIdx = fields.length;
        }
        fields.splice(insertIdx, 0, { tag: '62', value: sub05 });
      }
    }
  }
  
  // Reassemble the EMVCo string
  let rebuilt = '';
  for (const f of fields) {
    const lenStr = f.value.length.toString().padStart(2, '0');
    rebuilt += f.tag + lenStr + f.value;
  }
  
  // Append tag 6304 (CRC) and compute CRC16
  rebuilt += '6304';
  const crc = calcCRC16(rebuilt);
  return rebuilt + crc;
}

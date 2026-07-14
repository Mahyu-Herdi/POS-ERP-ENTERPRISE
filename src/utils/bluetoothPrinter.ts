// @ts-nocheck
import { formatTanggalIndo } from './dateFormatter';

export class BluetoothPrinter {
  device: any = null;
  server: any = null;
  characteristic: any = null;

  async connect() {
    try {
      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          '0000fee7-0000-1000-8000-00805f9b34fb'
        ]
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        console.log('Bluetooth device disconnected');
        this.disconnect();
      });

      this.server = await this.device.gatt.connect();

      if (!this.server) throw new Error('Koneksi ke printer gagal');

      const services = await this.server.getPrimaryServices();
      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            this.characteristic = char;
            return true;
          }
        }
      }

      throw new Error('Karakteristik penulisan tidak ditemukan pada printer ini');
    } catch (error: any) {
      const errMsg = error.message || String(error);
      if (!errMsg.includes("cancel") && !errMsg.includes("chooser")) {
        console.error('Bluetooth connection failed:', error);
      }
      throw error;
    }
  }

  async print(text: string) {
    if (!this.characteristic) {
      throw new Error('Printer belum terkoneksi. Silakan hubungkan ulang.');
    }

    const encoder = new TextEncoder();
    
    // ESC/POS Commands
    const initCmd = [0x1B, 0x40]; // Initialize printer
    const cutCmd = [0x1D, 0x56, 0x41, 0x10]; // Cut paper (if supported)
    
    let buffer: number[] = [];
    
    buffer.push(...initCmd);
    
    // We'll just send the formatted text line by line as plain text. 
    // The text formatting already handles padding for 32 chars (58mm printer).
    const lines = text.split('\n');
    for (const line of lines) {
      const lineData = Array.from(encoder.encode(line + '\n'));
      buffer.push(...lineData);
    }
    
    // Feed extra lines at the end to ensure it rolls past the cutter
    buffer.push(...Array.from(encoder.encode('\n\n\n')));
    
    // Cut command
    buffer.push(...cutCmd);

    const data = new Uint8Array(buffer);

    // Send data in chunks of 100 bytes (safe size for most BT LE devices)
    const chunkSize = 100;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      await this.sendData(chunk);
      // Small delay between chunks to prevent buffer overflow on cheap thermal printers
      await new Promise(resolve => setTimeout(resolve, 50)); 
    }
  }

  private async sendData(data: Uint8Array) {
    if (!this.characteristic) return;
    try {
      if (this.characteristic.properties.writeWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(data);
      } else if (this.characteristic.properties.write) {
        await this.characteristic.writeValue(data);
      }
    } catch (e) {
      console.error('Gagal mengirim data ke printer:', e);
      throw e;
    }
  }

  disconnect() {
    if (this.device && this.device.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.server = null;
    this.characteristic = null;
  }
}

export const btPrinter = new BluetoothPrinter();

export const formatReceipt = (tx: any, toko: any): string => {
  const lineLen = 32; // 58mm printer usually 32 chars wide
  const pad = (str: string, len: number, align: 'left' | 'right' | 'center' = 'left') => {
    if (str.length >= len) return str.substring(0, len);
    if (align === 'center') {
      const left = Math.floor((len - str.length) / 2);
      const right = len - str.length - left;
      return ' '.repeat(left) + str + ' '.repeat(right);
    }
    if (align === 'right') {
      return ' '.repeat(len - str.length) + str;
    }
    return str + ' '.repeat(len - str.length);
  };

  const line = '-'.repeat(lineLen) + '\n';
  let res = '';

  // Header
  res += pad(toko.nama || 'ERBEA COFFEE SPACE', lineLen, 'center') + '\n';
  if (toko.alamat) {
    res += pad(toko.alamat, lineLen, 'center') + '\n';
  }
  if (toko.kontak) {
    res += pad(toko.kontak, lineLen, 'center') + '\n';
  }
  res += line;

  // Info
  res += `Waktu : ${formatTanggalIndo(tx.tgl)}\n`;
  res += `Pelanggan : ${tx.ident || 'Umum'}\n`;
  res += `Status: ${tx.tipe || 'Penjualan'}\n`;
  res += line;

  // Items
  const items = tx.items || [];
  items.forEach((item: any) => {
    res += `${item.name || item.nama}\n`;
    const qtyPrice = `${item.qty} x ${item.harga.toLocaleString('id-ID')}`;
    const total = (item.qty * item.harga).toLocaleString('id-ID');
    res += pad(qtyPrice, 16, 'left') + pad(total, 16, 'right') + '\n';
  });
  res += line;

  // Footer
  const subtotal = tx.subtotal || tx.total;
  res += pad('Subtotal', 16, 'left') + pad(subtotal.toLocaleString('id-ID'), 16, 'right') + '\n';
  
  if (tx.diskon > 0) {
    res += pad('Diskon', 16, 'left') + pad('-' + tx.diskon.toLocaleString('id-ID'), 16, 'right') + '\n';
  }

  res += pad('TOTAL', 16, 'left') + pad(tx.total.toLocaleString('id-ID'), 16, 'right') + '\n';
  
  const bayar = tx.bayar || tx.total;
  res += pad(`Bayar (${tx.metode || 'Cash'})`, 16, 'left') + pad(bayar.toLocaleString('id-ID'), 16, 'right') + '\n';
  
  const kembali = bayar - tx.total;
  res += pad('Kembali', 16, 'left') + pad(kembali === 0 ? '-' : kembali.toLocaleString('id-ID'), 16, 'right') + '\n';

  res += line;
  res += pad('Terima Kasih!', lineLen, 'center') + '\n';
  res += pad('Silakan Datang Kembali', lineLen, 'center') + '\n';

  return res;
};

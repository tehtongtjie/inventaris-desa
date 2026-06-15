import React, { useState } from 'react';
import { db, storage } from './firebase'; 
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';

function App() {
  // State untuk Identitas Tim & UMKM
  const [kelompok, setKelompok] = useState('');
  const [namaUmkm, setNamaUmkm] = useState('');
  const [namaPemilik, setNamaPemilik] = useState('');
  const [noHp, setNoHp] = useState(''); 
  const [omset, setOmset] = useState(''); 
  const [sosmed, setSosmed] = useState(''); // Kolom Baru: Sosmed
  const [deskripsiMasalah, setDeskripsiMasalah] = useState(''); // Kolom Baru: Deskripsi Masalah
  const [dusun, setDusun] = useState('');
  const [kategori, setKategori] = useState('');

  // State untuk GPS, Kamera, & Loading
  const [loadingGps, setLoadingGps] = useState(false);
  const [koordinat, setKoordinat] = useState({ lat: null, lng: null });
  const [fileFoto, setFileFoto] = useState(null);
  const [previewFoto, setPreviewFoto] = useState(null);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [loadingDownload, setLoadingDownload] = useState(false);

  // 1. FUNGSI AMBIL GPS OTOMATIS
  const ambilGpsOtomatis = () => {
    if ("geolocation" in navigator) {
      setLoadingGps(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setKoordinat({ lat: position.coords.latitude, lng: position.coords.longitude });
          setLoadingGps(false);
          alert("📍 Lokasi HP berhasil dikunci!");
        },
        (error) => {
          setLoadingGps(false);
          alert("Gagal mengambil GPS. Pastikan setelan lokasi/GPS di HP aktif!");
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    } else {
      alert("Browser HP tidak mendukung fitur GPS Geolocation.");
    }
  };

  // 2. FUNGSI HANDLE FOTO KAMERA + KOMPRESI OTOMATIS
  const handleKameraChange = async (e) => {
    const fileAsli = e.target.files; 
    if (!fileAsli) return;

    setPreviewFoto(URL.createObjectURL(fileAsli));

    const opsiKompresi = {
      maxSizeMB: 0.3,          
      maxWidthOrHeight: 1024,  
      useWebWorker: true       
    };

    try {
      const fileHasilKompresi = await imageCompression(fileAsli, opsiKompresi);
      setFileFoto(fileHasilKompresi);
    } catch (error) {
      console.error("Gagal mengkompresi gambar:", error);
      setFileFoto(fileAsli);
    }
  };

  // 3. FUNGSI SIMPAN DATA KE FIREBASE
  const handleSubmitData = async (e) => {
    e.preventDefault();
    
    if (!koordinat.lat || !fileFoto) {
      alert("⚠️ Gagal menyimpan! Harap klik tombol GPS dan ambil foto UMKM terlebih dahulu.");
      return;
    }

    setLoadingSubmit(true);

    try {
      const namaFileUnik = `umkm_${kelompok || 'anonim'}_${Date.now()}_${fileFoto.name}`;
      const storageRef = ref(storage, `foto_umkm/${namaFileUnik}`);
      
      const uploadResult = await uploadBytes(storageRef, fileFoto);
      const downloadUrl = await getDownloadURL(uploadResult.ref);

      // Simpan semua data lapangan ke Firestore
      await addDoc(collection(db, "umkm_sukadana"), {
        tim_pendata: kelompok,
        nama_umkm: namaUmkm,
        nama_pemilik: namaPemilik,
        no_hp: noHp,
        omset_per_bulan: omset,
        memiliki_sosmed: sosmed,
        deskripsi_masalah: deskripsiMasalah,
        dusun: dusun,
        kategori_usaha: kategori,
        latitude: koordinat.lat,
        longitude: koordinat.lng,
        foto_url: downloadUrl,
        waktu_input: serverTimestamp()
      });

      alert(`🎉 Data UMKM dari ${kelompok} sukses tersimpan ke Firebase!`);
      
      // Reset Form total setelah sukses
      setNamaUmkm('');
      setNamaPemilik('');
      setNoHp('');
      setOmset('');
      setSosmed('');
      setDeskripsiMasalah('');
      setDusun('');
      setKategori('');
      setKoordinat({ lat: null, lng: null });
      setFileFoto(null);
      setPreviewFoto(null);

    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan sistem saat mengunggah data.");
    } finally {
      setLoadingSubmit(false);
    }
  };

  // 4. FUNGSI REKAP & DOWNLOAD DATA EXCEL (CSV)
  const downloadDataExcel = async () => {
    setLoadingDownload(true);
    try {
      const q = query(collection(db, "umkm_sukadana"), orderBy("waktu_input", "desc"));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        alert("Belum ada data UMKM yang masuk di Firebase!");
        setLoadingDownload(false);
        return;
      }

      const semuaData = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        semuaData.push({
          "Tim Pendata": data.tim_pendata || "",
          "Nama UMKM": data.nama_umkm || "",
          "Nama Pemilik": data.nama_pemilik || "",
          "No HP": data.no_hp || "",
          "Omset / Bulan": data.omset_per_bulan || "",
          "Memiliki Sosmed": data.memiliki_sosmed || "",
          "Deskripsi Masalah": data.deskripsi_masalah || "",
          "Dusun": data.dusun || "",
          "Kategori Usaha": data.kategori_usaha || "",
          "Latitude": data.latitude || "",
          "Longitude": data.longitude || "",
          "Link Foto Produk": data.foto_url || "",
          "Waktu Input": data.waktu_input ? new Date(data.waktu_input.seconds * 1000).toLocaleString('id-ID') : ""
        });
      });

      const headers = Object.keys(semuaData).join(",");
      const rows = semuaData.map(obj => 
        Object.values(obj).map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")
      );
      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers, ...rows].join("\n");

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `REKAP_DATA_UMKM_SUKADANA_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      alert("🚀 Rekap data sukses diunduh!");
    } catch (error) {
      console.error(error);
      alert("Gagal menarik data dari server.");
    } finally {
      setLoadingDownload(false);
    }
  };

  return (
    <div style={{ padding: '15px', maxWidth: '480px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', backgroundColor: '#fff', minHeight: '100vh' }}>
      
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '25px', paddingBottom: '15px', borderBottom: '2px solid #eaeaea' }}>
        <h2 style={{ margin: '0 0 5px 0', color: '#1a1a1a', fontSize: '24px', fontWeight: '800' }}>Sensus UMKM Digital</h2>
        <p style={{ margin: '0', fontSize: '14px', color: '#666', fontWeight: '500' }}>Desa Sukadana • Internal KKN 2026</p>
      </div>
      
      <form onSubmit={handleSubmitData} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        
        {/* Dropdown Kelompok */}
        <div>
          <label style={{ display: 'block', fontWeight: '700', marginBottom: '6px', color: '#333', fontSize: '14px' }}>Tim Pendata KKN:</label>
          <select value={kelompok} onChange={(e) => setKelompok(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '15px', backgroundColor: '#f9f9f9', outline: 'none' }}>
            <option value="">-- Pilih Kelompok Kamu --</option>
            <option value="Kelompok 1">Kelompok 1</option>
            <option value="Kelompok 2">Kelompok 2</option>
            <option value="Kelompok 3">Kelompok 3</option>
            <option value="Kelompok 4">Kelompok 4</option>
            <option value="Kelompok 5">Kelompok 5</option>
          </select>
        </div>

        {/* Input Data Teks */}
        <div>
          <label style={{ display: 'block', fontWeight: '700', marginBottom: '6px', color: '#333', fontSize: '14px' }}>Nama Tempat / UMKM:</label>
          <input type="text" value={namaUmkm} onChange={(e) => setNamaUmkm(e.target.value)} required placeholder="Masukkan nama toko/usaha" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '15px', boxSizing: 'border-box', outline: 'none' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: '700', marginBottom: '6px', color: '#333', fontSize: '14px' }}>Nama Pemilik:</label>
          <input type="text" value={namaPemilik} onChange={(e) => setNamaPemilik(e.target.value)} required placeholder="Nama pemilik usaha" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '15px', boxSizing: 'border-box', outline: 'none' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: '700', marginBottom: '6px', color: '#333', fontSize: '14px' }}>Nomor HP / WhatsApp Pemilik:</label>
          <input type="tel" value={noHp} onChange={(e) => setNoHp(e.target.value)} required placeholder="Contoh: 081234567xxx" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '15px', boxSizing: 'border-box', outline: 'none' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: '700', marginBottom: '6px', color: '#333', fontSize: '14px' }}>Estimasi Omset per Bulan:</label>
          <select value={omset} onChange={(e) => setOmset(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '15px', backgroundColor: '#f9f9f9', outline: 'none' }}>
            <option value="">-- Pilih Range Omset --</option>
            <option value="< 1 Juta">Kurang dari Rp 1 Juta</option>
            <option value="1 - 5 Juta">Rp 1 Juta - Rp 5 Juta</option>
            <option value="5 - 10 Juta">Rp 5 Juta - Rp 10 Juta</option>
            <option value="10 - 50 Juta">Rp 10 Juta - Rp 50 Juta</option>
            <option value="> 50 Juta">Lebih dari Rp 50 Juta</option>
          </select>
        </div>

        {/* INPUT BARU: KEPEMILIKAN SOSMED */}
        <div>
          <label style={{ display: 'block', fontWeight: '700', marginBottom: '6px', color: '#333', fontSize: '14px' }}>Apakah Memiliki Media Sosial Usaha?</label>
          <select value={sosmed} onChange={(e) => setSosmed(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '15px', backgroundColor: '#f9f9f9', outline: 'none' }}>
            <option value="">-- Pilih Status Sosial Media --</option>
            <option value="Ada">Ya, Ada (Instagram/Facebook/TikTok/WA Business)</option>
            <option value="Tidak Ada">Tidak Ada / Belum Menggunakan Sosmed</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: '700', marginBottom: '6px', color: '#333', fontSize: '14px' }}>Nama Dusun:</label>
          <input type="text" value={dusun} onChange={(e) => setDusun(e.target.value)} required placeholder="Contoh: Dusun Sukadana Barat" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '15px', boxSizing: 'border-box', outline: 'none' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: '700', marginBottom: '6px', color: '#333', fontSize: '14px' }}>Kategori Bidang Usaha:</label>
          <select value={kategori} onChange={(e) => setKategori(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '15px', backgroundColor: '#f9f9f9', outline: 'none' }}>
            <option value="">-- Pilih Jenis Kategori --</option>
            <option value="Kuliner">Kuliner (Warung, Snack, Rumah Makan)</option>
            <option value="Kerajinan">Kerajinan / Industri Rumah Tangga</option>
            <option value="Pertanian">Pertanian / Peternakan / Kebun</option>
            <option value="Kios">Kios / Toko Kelontong Sembako</option>
            <option value="Jasa">Jasa (Bengkel, Cukur, Penjahit)</option>
          </select>
        </div>

        {/* INPUT BARU: DESKRIPSI MASALAH */}
        <div>
          <label style={{ display: 'block', fontWeight: '700', marginBottom: '6px', color: '#333', fontSize: '14px' }}>Deskripsi Masalah / Kendala UMKM:</label>
          <textarea value={deskripsiMasalah} onChange={(e) => setDeskripsiMasalah(e.target.value)} required placeholder="Ceritakan kendala usaha (misal: Kurang modal, pemasaran macet, belum ada izin PIRT, kemasan kurang menarik, dll.)" rows="4" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '15px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
        </div>

        {/* Panel GPS */}
        <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #e9ecef' }}>
          <label style={{ display: 'block', fontWeight: '700', marginBottom: '8px', color: '#495057', fontSize: '14px' }}>Sistem Kunci Lokasi (GPS)</label>
          {koordinat.lat ? (
            <div style={{ margin: '0 0 12px 0', padding: '8px', backgroundColor: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace', color: '#2e7d32', fontWeight: 'bold', textAlign: 'center' }}>
              🎯 LOKASI TERKUNCI: {koordinat.lat.toFixed(6)}, {koordinat.lng.toFixed(6)}
            </div>
          ) : (
            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#6c757d' }}>⚠️ Status: Lokasi titik koordinat belum dikunci.</p>
          )}
          <button type="button" onClick={ambilGpsOtomatis} disabled={loadingGps} style={{ width: '100%', padding: '10px', cursor: 'pointer', backgroundColor: '#0056b3', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            {loadingGps ? '🔄 Menghubungkan ke Satelit GPS...' : '📍 Kunci Koordinat Otomatis'}
          </button>
        </div>

        {/* Panel Kamera */}
        <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #e9ecef' }}>
          <label style={{ display: 'block', fontWeight: '700', marginBottom: '8px', color: '#495057', fontSize: '14px' }}>Dokumentasi Foto Lapangan</label>
          <input type="file" accept="image/*" capture="environment" onChange={handleKameraChange} style={{ width: '100%', fontSize: '14px', color: '#495057' }} />
          
          {previewFoto && (
            <div style={{ marginTop: '12px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #ddd' }}>
              <img src={previewFoto} alt="Pratinjau Lapangan" style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', display: 'block' }} />
            </div>
          )}
        </div>

        {/* Tombol Simpan */}
        <button type="submit" disabled={loadingSubmit} style={{ padding: '14px', fontSize: '16px', fontWeight: 'bold', backgroundColor: loadingSubmit ? '#6c757d' : '#198754', color: 'white', border: 'none', borderRadius: '8px', cursor: loadingSubmit ? 'not-allowed' : 'pointer', marginTop: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.15)' }}>
          {loadingSubmit ? '⚡ Memproses & Mengkompres Gambar...' : '💾 SIMPAN DATA KKN'}
        </button>

      </form>

      {/* Panel Khusus Unduh Data Rekap */}
      <div style={{ marginTop: '40px', padding: '15px', borderTop: '2px dashed #ccc', backgroundColor: '#fff3cd', borderRadius: '8px', border: '1px solid #ffeba2' }}>
        <h4 style={{ margin: '0 0 5px 0', color: '#856404', fontWeight: 'bold' }}>🔑 Fitur Khusus Rekap Data</h4>
        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#856404' }}>Khusus bagian rekapitulasi data. Klik tombol di bawah dari laptop untuk mengunduh seluruh data gabungan kelompok dalam bentuk file CSV/Excel.</p>
        
        <button type="button" onClick={downloadDataExcel} disabled={loadingDownload} style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 'bold', backgroundColor: '#ffc107', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          {loadingDownload ? '⏳ Sedang Menarik Data Server...' : '📥 UNDUH REKAP DATA (EXCEL)'}
        </button>
      </div>

    </div>
  );
}

export default App;
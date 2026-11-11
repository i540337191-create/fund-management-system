import { FileAudio, FileImage, FileSpreadsheet, FileText } from 'lucide-react';

export function MaterialFileIcon({ name }: { name: string }) {
  const format = name.includes('.') ? name.split('.').pop()!.toUpperCase() : 'FILE';
  const Icon = /^(PNG|JPE?G|WEBP|GIF)$/.test(format) ? FileImage
    : /^(XLSX?|CSV)$/.test(format) ? FileSpreadsheet
    : /^(MP3|WAV|M4A|OGG|WEBM|FLAC)$/.test(format) ? FileAudio : FileText;
  return <span className="material-file-icon" data-format={format} aria-hidden="true"><Icon size={30} strokeWidth={1.5} /><span>{format}</span></span>;
}

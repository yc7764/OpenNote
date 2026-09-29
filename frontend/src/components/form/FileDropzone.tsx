"use client";
import { useRef, useState } from 'react';
import { toast } from 'sonner';

type Props = {
  onFileSelected: (file: File) => void;
  selectedFile?: File | null;
  accept?: string;
  maxBytes?: number;
  compact?: boolean;
};

export default function FileDropzone({ onFileSelected, selectedFile, accept = 'audio/*,.wav,.mp3,.m4a,.flac,.aac,.ogg,.opus,.wma,.aiff', maxBytes = 1 * 1024 * 1024 * 1024, compact = false }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    if (e.type === 'dragleave') setDragActive(false);
  };

  const validateAndSelect = (file: File) => {
    if (file.size > maxBytes) {
      toast.error('파일 크기가 1GB를 초과합니다.');
      return;
    }
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    const allowed = accept.split(',').map(s => s.trim());
    if (!allowed.includes(ext)) {
      toast.error('음원 파일만 업로드할 수 있습니다.');
      return;
    }
    onFileSelected(file);
    toast.success('파일이 선택되었습니다.');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) validateAndSelect(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSelect(file);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  return (
    <div
      className={`
        border-2 border-dashed rounded-xl text-center cursor-pointer transition-all h-full flex items-center justify-center
        ${compact ? 'p-6 sm:p-10' : 'p-8 sm:p-12'}
        ${selectedFile
          ? 'border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/20'
          : dragActive
          ? 'border-primary-500 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/20'
          : 'border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
        }
      `}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input ref={fileInputRef} type="file" accept={accept} onChange={handleFileInputChange} className="hidden" />

      {selectedFile ? (
        <div>
          {/* Check Icon */}
          <div className={`mx-auto mb-2 sm:mb-3 flex items-center justify-center ${compact ? 'w-8 h-8 sm:w-10 sm:h-10' : 'w-12 h-12 sm:w-16 sm:h-16'}`}>
            <svg
              className="w-full h-full text-green-500 dark:text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          {/* File Info */}
          <p className={`font-medium text-neutral-900 dark:text-neutral-100 mb-1 ${compact ? 'text-sm' : 'text-base'}`}>
            파일 선택 완료
          </p>
          <p className={`text-neutral-700 dark:text-neutral-300 font-medium mb-1 truncate max-w-[280px] mx-auto ${compact ? 'text-xs' : 'text-sm'}`}>
            {selectedFile.name}
          </p>
          <p className={`text-neutral-500 dark:text-neutral-400 ${compact ? 'text-xs' : 'text-sm'}`}>
            {formatFileSize(selectedFile.size)}
          </p>
          <p className={`text-neutral-400 dark:text-neutral-500 mt-2 ${compact ? 'text-[10px]' : 'text-xs'}`}>
            클릭하여 파일 변경
          </p>
        </div>
      ) : (
        <div>
          {/* Cloud Upload Icon */}
          <div className={`mx-auto mb-2 sm:mb-3 flex items-center justify-center ${compact ? 'w-8 h-8 sm:w-10 sm:h-10' : 'w-12 h-12 sm:w-16 sm:h-16'}`}>
            <svg
              className="w-full h-full text-primary-500 dark:text-primary-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>

          {/* Main Text */}
          <p className={`font-medium text-neutral-900 dark:text-neutral-100 mb-1 sm:mb-1.5 ${compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base sm:mb-2'}`}>
            클릭하거나 드래그하여 파일 업로드
          </p>

          {/* Supported Formats */}
          <p className={`text-neutral-500 dark:text-neutral-400 ${compact ? 'text-[10px] sm:text-xs mb-0.5' : 'text-xs sm:text-sm mb-1'}`}>
            지원: MP3, WAV, M4A, FLAC, AAC, OGG
          </p>

          {/* Max File Size */}
          <p className={`text-neutral-500 dark:text-neutral-400 ${compact ? 'text-[10px] sm:text-xs' : 'text-xs sm:text-sm'}`}>
            최대 1GB
          </p>
        </div>
      )}
    </div>
  );
}



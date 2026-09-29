"use client";
type Props = { message?: string; fullScreen?: boolean };
export default function Loader({ message = '로딩 중...', fullScreen = true }: Props) {
  const container = fullScreen ? 'min-h-screen flex items-center justify-center' : 'flex items-center justify-center';
  return (
    <div className={container}>
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
        <p className="text-gray-600 dark:text-gray-300 mt-4">{message}</p>
      </div>
    </div>
  );
}



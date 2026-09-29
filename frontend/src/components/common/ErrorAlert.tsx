"use client";
export default function ErrorAlert({ lines }: { lines: string[] }) {
  return (
    <div className="text-center mb-4">
      <div className="text-red-700 bg-red-50 border border-red-200 rounded p-3">
        {lines.map((line, i) => (
          <p key={i} className="m-0 mb-1 text-sm">{line}</p>
        ))}
      </div>
    </div>
  );
}



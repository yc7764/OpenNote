'use client';

import { useState, useCallback, useMemo } from 'react';

interface UseNoteSelectionReturn {
  selectedIds: Set<number>;
  isSelectionMode: boolean;
  toggle: (id: number) => void;
  select: (id: number) => void;
  deselect: (id: number) => void;
  selectAll: (ids: number[]) => void;
  clear: () => void;
  isSelected: (id: number) => boolean;
  selectedCount: number;
  getSelectedArray: () => number[];
  enterSelectionMode: () => void;
  exitSelectionMode: () => void;
}

export function useNoteSelection(): UseNoteSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [_isSelectionMode, setIsSelectionMode] = useState(false);

  // 선택 모드는 명시적으로 진입/퇴장 (0개 선택해도 모드 유지)
  const isSelectionMode = _isSelectionMode;
  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  const toggle = useCallback((id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const select = useCallback((id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      newSet.add(id);
      return newSet;
    });
  }, []);

  const deselect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  }, []);

  const selectAll = useCallback((ids: number[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // 선택 모드 진입 (노트 선택 없이)
  const enterSelectionMode = useCallback(() => {
    setIsSelectionMode(true);
  }, []);

  // 선택 모드 퇴장 (선택 초기화 포함)
  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((id: number) => {
    return selectedIds.has(id);
  }, [selectedIds]);

  const getSelectedArray = useCallback(() => {
    return Array.from(selectedIds);
  }, [selectedIds]);

  return {
    selectedIds,
    isSelectionMode,
    toggle,
    select,
    deselect,
    selectAll,
    clear,
    isSelected,
    selectedCount,
    getSelectedArray,
    enterSelectionMode,
    exitSelectionMode,
  };
}
